export interface Profile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  phone: string | null;
  extra_info: Record<string, unknown> | null;
  is_staff: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}
