import { useQuery } from "@tanstack/react-query";
import { api, type AppPreferences } from "@/lib/api";

export const DEFAULT_PREFERENCES: AppPreferences = {
  default_country_code: "91",
  notify_pending_schedules: true,
  notify_new_messages: true,
  enter_to_send: true,
};

export function useAppSettings(enabled = true) {
  return useQuery({
    queryKey: ["app-settings"],
    queryFn: api.settings.get,
    enabled,
    staleTime: 30_000,
  });
}

export function useAppPreferences(): AppPreferences {
  const { data } = useAppSettings();
  return data?.preferences ?? DEFAULT_PREFERENCES;
}
