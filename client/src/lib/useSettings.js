import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { getErrorMessage, usersApi } from './api.js';
import { APPEARANCE_DEFAULTS, applyAppearance, getAppearance } from './appearance.js';

const APPEARANCE_KEYS = Object.keys(APPEARANCE_DEFAULTS);

/**
 * Round 2: change one or more settings. Appearance changes apply instantly (and to
 * localStorage); everything is then saved with PUT /users/settings and rolled back
 * with a toast if that fails. Returns a promise that resolves to true on success.
 */
export function useUpdateSettings() {
  const { user, updateUser } = useAuth();
  const toast = useToast();

  return useCallback(
    async (patch) => {
      const before = { ...(user?.settings ?? {}) };
      const appearanceBefore = getAppearance();
      const appearancePatch = Object.fromEntries(Object.entries(patch).filter(([key]) => APPEARANCE_KEYS.includes(key)));
      if (Object.keys(appearancePatch).length) applyAppearance(appearancePatch);
      updateUser({ settings: { ...before, ...patch } });
      try {
        const { settings } = await usersApi.updateSettings(patch);
        updateUser({ settings });
        return true;
      } catch (err) {
        applyAppearance(appearanceBefore);
        updateUser({ settings: before });
        toast.error(getErrorMessage(err, 'Could not save that setting.'));
        return false;
      }
    },
    [user?.settings, updateUser, toast],
  );
}
