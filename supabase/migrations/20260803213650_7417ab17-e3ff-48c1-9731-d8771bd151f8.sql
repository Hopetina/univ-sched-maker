
REVOKE EXECUTE ON FUNCTION public.current_user_email() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_own_student(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_audit_actor() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_email() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_own_student(uuid) TO authenticated;
