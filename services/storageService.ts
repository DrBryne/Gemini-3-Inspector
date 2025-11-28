export const HISTORY_KEYS = {
  ROLE: 'gemini_analyzer_role',
  CRITERIA: 'gemini_analyzer_criteria',
  OUTPUT_CONFIG: 'gemini_analyzer_output_config'
};

/**
 * Retrieves the most recent prompt version from the stored history array.
 * Returns an empty string if no history exists.
 */
export const getLatestFromHistory = (key: string): string => {
  try {
    const historyJson = localStorage.getItem(`${key}_history`);
    if (historyJson) {
      const history = JSON.parse(historyJson);
      // We expect an array of strings, where index 0 is the most recent.
      if (Array.isArray(history) && history.length > 0) {
        return history[0];
      }
    }
  } catch (e) {
    console.warn(`Failed to load history for ${key}`, e);
  }
  return "";
};