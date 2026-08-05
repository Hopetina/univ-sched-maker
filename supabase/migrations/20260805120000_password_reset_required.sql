-- Track whether an account must change its password before continuing to use the app.
ALTER TABLE public.profiles ADD COLUMN password_reset_required boolean NOT NULL DEFAULT false;
