-- =========================================================================
-- SUPABASE / POSTGRESQL SCHEMA FOR EGYPTIAN ENGINEERING SYNDICATE
-- Copy and paste this script into your Supabase SQL Editor.
-- =========================================================================

-- Enable pg_net extension to make HTTP calls to Telegram directly from SQL
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1. Create the configurations table (Singleton)
CREATE TABLE IF NOT EXISTS public.syndicate_configuration (
    id INT PRIMARY KEY DEFAULT 1,
    monthly_limit_engineer INT DEFAULT 100,
    monthly_limit_consultant INT DEFAULT 140,
    monthly_limit_concrete_consultant INT DEFAULT 180,
    monthly_limit_specialized_office INT DEFAULT 250,
    monthly_limit_multi_office INT DEFAULT 450,
    daily_limit_morning INT DEFAULT 150,
    daily_limit_evening INT DEFAULT 200,
    telegram_bot_token TEXT DEFAULT '8670675152:AAHdxkZRtH4jj4E6tC4-vC9W5eCD9jDzXAw',
    telegram_chat_id TEXT DEFAULT '-5366650527',
    CONSTRAINT singleton_check CHECK (id = 1)
);

-- Pre-populate default values
INSERT INTO public.syndicate_configuration (id) 
VALUES (1) 
ON CONFLICT (id) DO UPDATE 
SET telegram_bot_token = '8670675152:AAHdxkZRtH4jj4E6tC4-vC9W5eCD9jDzXAw',
    telegram_chat_id = '-5366650527';

-- 2. Create the applications table
CREATE TABLE IF NOT EXISTS public.applications (
    id BIGSERIAL PRIMARY KEY,
    engineer_name TEXT NOT NULL,
    registration_num TEXT NOT NULL,
    division TEXT NOT NULL,
    registry_num TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('engineer', 'consultant', 'consultant_concrete', 'specialized_office', 'multi_office')),
    certificate_count INT NOT NULL CHECK (certificate_count >= 1 AND certificate_count <= 20),
    pickup_date DATE NOT NULL,
    pickup_slot TEXT NOT NULL CHECK (pickup_slot IN ('morning', 'evening')),
    created_at TIMESTAMPTZ DEFAULT timezone('UTC'::text, now()) NOT NULL
);

-- Enable RLS (Row Level Security)
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.syndicate_configuration ENABLE ROW LEVEL SECURITY;

-- Security Policies
CREATE POLICY "Allow public inserts on applications" ON public.applications FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public reads on applications" ON public.applications FOR SELECT USING (true);
CREATE POLICY "Allow public reads on configurations" ON public.syndicate_configuration FOR SELECT USING (true);
CREATE POLICY "Allow admin updates on configurations" ON public.syndicate_configuration FOR UPDATE USING (true);

-- 3. BEFORE INSERT Trigger: Enforce rules, limits, and deadlines
CREATE OR REPLACE FUNCTION public.check_application_constraints()
RETURNS TRIGGER AS $$
DECLARE
    config RECORD;
    today_local DATE;
    now_local TIMESTAMP;
    day_of_week INT;
    current_hour INT;
    existing_today_booking INT;
    total_slot_certs INT;
    monthly_certs_sum INT;
    user_limit INT;
    start_of_month DATE;
    end_of_month DATE;
BEGIN
    -- Fetch configuration
    SELECT * INTO config FROM public.syndicate_configuration WHERE id = 1;
    
    -- Calculate Cairo local time details
    now_local := timezone('Africa/Cairo', now());
    today_local := now_local::DATE;
    
    -- A. Check if the date is in the past
    IF NEW.pickup_date < today_local THEN
        RAISE EXCEPTION 'لا يمكن حجز موعد في تاريخ سابق.';
    END IF;

    -- B. Check if it's the weekend (Thursday and Friday are holidays)
    day_of_week := EXTRACT(isodow FROM NEW.pickup_date);
    IF day_of_week IN (4, 5) THEN
        RAISE EXCEPTION 'يومي الخميس والجمعة عطلة رسمية بالنقابة ولا يمكن حجز موعد استلام فيهما.';
    END IF;

    -- C. Deadline check if date is today
    IF NEW.pickup_date = today_local THEN
        current_hour := EXTRACT(HOUR FROM now_local);
        IF NEW.pickup_slot = 'morning' AND current_hour >= 9 THEN
            RAISE EXCEPTION 'انتهى موعد التسجيل للفترة الصباحية لهذا اليوم (الساعة 9:00 صباحاً).';
        END IF;
        IF NEW.pickup_slot = 'evening' AND current_hour >= 17 THEN
            RAISE EXCEPTION 'انتهى موعد التسجيل للفترة المسائية لهذا اليوم (الساعة 5:00 مساءً).';
        END IF;
    END IF;

    -- D. Double booking check (Cannot book both shifts on the same day)
    SELECT COUNT(*) INTO existing_today_booking 
    FROM public.applications
    WHERE registration_num = NEW.registration_num AND pickup_date = NEW.pickup_date;
    
    IF existing_today_booking > 0 THEN
        RAISE EXCEPTION 'عذراً، لا يمكنك حجز أكثر من فترة واحدة في نفس اليوم.';
    END IF;

    -- E. Daily shift limits check
    SELECT COALESCE(SUM(certificate_count), 0) INTO total_slot_certs
    FROM public.applications
    WHERE pickup_date = NEW.pickup_date AND pickup_slot = NEW.pickup_slot;

    IF NEW.pickup_slot = 'morning' AND (total_slot_certs + NEW.certificate_count > config.daily_limit_morning) THEN
        RAISE EXCEPTION 'تم تجاوز السعة المتاحة للفترة الصباحية اليوم. المتبقي: % شهادة.', (config.daily_limit_morning - total_slot_certs);
    END IF;
    
    IF NEW.pickup_slot = 'evening' AND (total_slot_certs + NEW.certificate_count > config.daily_limit_evening) THEN
        RAISE EXCEPTION 'تم تجاوز السعة المتاحة للفترة المسائية اليوم. المتبقي: % شهادة.', (config.daily_limit_evening - total_slot_certs);
    END IF;

    -- F. Monthly limit by category check
    start_of_month := date_trunc('month', NEW.pickup_date)::DATE;
    end_of_month := (date_trunc('month', NEW.pickup_date) + interval '1 month' - interval '1 day')::DATE;

    SELECT COALESCE(SUM(certificate_count), 0) INTO monthly_certs_sum
    FROM public.applications
    WHERE registration_num = NEW.registration_num AND pickup_date BETWEEN start_of_month AND end_of_month;

    CASE NEW.category
        WHEN 'engineer' THEN user_limit := config.monthly_limit_engineer;
        WHEN 'consultant' THEN user_limit := config.monthly_limit_consultant;
        WHEN 'consultant_concrete' THEN user_limit := config.monthly_limit_concrete_consultant;
        WHEN 'specialized_office' THEN user_limit := config.monthly_limit_specialized_office;
        WHEN 'multi_office' THEN user_limit := config.monthly_limit_multi_office;
        ELSE user_limit := 100;
    END CASE;

    IF monthly_certs_sum + NEW.certificate_count > user_limit THEN
        RAISE EXCEPTION 'لقد تجاوزت الحد الأقصى المسموح به لفئتك هذا الشهر. المتبقي المتاح لك: % شهادة.', (user_limit - monthly_certs_sum);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_check_application_constraints
BEFORE INSERT ON public.applications
FOR EACH ROW
EXECUTE FUNCTION public.check_application_constraints();

-- 4. AFTER INSERT Trigger: Send report to Telegram directly from PostgreSQL
CREATE OR REPLACE FUNCTION public.send_telegram_notification()
RETURNS TRIGGER AS $$
DECLARE
    config RECORD;
    queue_pos INT;
    category_ar TEXT;
    slot_ar TEXT;
    message_text TEXT;
BEGIN
    -- Fetch Telegram settings
    SELECT * INTO config FROM public.syndicate_configuration WHERE id = 1;
    
    IF config.telegram_bot_token IS NULL OR config.telegram_chat_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Calculate Queue Position (FIFO)
    SELECT COUNT(*) INTO queue_pos 
    FROM public.applications 
    WHERE pickup_date = NEW.pickup_date 
      AND pickup_slot = NEW.pickup_slot 
      AND created_at <= NEW.created_at;

    -- Translate fields to Arabic for the alert
    CASE NEW.category
        WHEN 'engineer' THEN category_ar := 'مهندس';
        WHEN 'consultant' THEN category_ar := 'مهندس استشاري';
        WHEN 'consultant_concrete' THEN category_ar := 'مهندس استشاري تصميم و انشءات خرسانية';
        WHEN 'specialized_office' THEN category_ar := 'مكتب نوعي';
        WHEN 'multi_office' THEN category_ar := 'مكتب متعدد';
        ELSE category_ar := NEW.category;
    END CASE;

    CASE NEW.pickup_slot
        WHEN 'morning' THEN slot_ar := 'فترة صباحية (9 ص - 1 م)';
        WHEN 'evening' THEN slot_ar := 'فترة مسائية (1 م - 5 م)';
        ELSE slot_ar := NEW.pickup_slot;
    END CASE;

    -- Build Markdown Message
    message_text := '🏛️ *طلب حجز شهادات جديد - نقابة المهندسين*' || chr(10) || chr(10) ||
                    '👤 *المهندس:* ' || NEW.engineer_name || chr(10) ||
                    '🔢 *رقم القيد:* ' || NEW.registration_num || chr(10) ||
                    '🔢 *رقم السجل:* ' || NEW.registry_num || chr(10) ||
                    '📂 *الشعبة:* ' || NEW.division || chr(10) ||
                    '💼 *الفئة:* ' || category_ar || chr(10) ||
                    '📄 *عدد الشهادات المطلوبة:* ' || NEW.certificate_count || ' شهادة' || chr(10) ||
                    '📅 *تاريخ الاستلام:* ' || NEW.pickup_date || chr(10) ||
                    '⏰ *الفترة:* ' || slot_ar || chr(10) || chr(10) ||
                    '⏱️ *ترتيب الحجز في طابور الفترة:* ' || queue_pos || ' (الأسبق فالأسبق).';

    -- Async POST to Telegram via pg_net
    PERFORM net.http_post(
        url := 'https://api.telegram.org/bot' || config.telegram_bot_token || '/sendMessage',
        body := json_build_object(
            'chat_id', config.telegram_chat_id,
            'text', message_text,
            'parse_mode', 'Markdown'
        )::text,
        headers := '{"Content-Type": "application/json"}'::jsonb
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_send_telegram_notification
AFTER INSERT ON public.applications
FOR EACH ROW
EXECUTE FUNCTION public.send_telegram_notification();
