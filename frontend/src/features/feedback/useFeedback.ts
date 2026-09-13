import { useCallback, useState } from "react";
import { useSelector } from "react-redux";
import { supabase } from "../../services/supabaseClient";
import type { RootState } from "../../store";

export type FeedbackCategory = "question" | "problem" | "idea" | "other";

export function useFeedback() {
  const { user } = useSelector((state: RootState) => state.auth);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  const submit = useCallback(
    async (category: FeedbackCategory, message: string) => {
      setError(null);
      const trimmed = message.trim();
      if (!trimmed) {
        setError("Please write a few words so we know how to help.");
        return false;
      }
      if (trimmed.length > 5000) {
        setError("Please keep your message under 5000 characters.");
        return false;
      }
      if (!user?.id) {
        setError("Please sign in again, then send your feedback.");
        return false;
      }
      setLoading(true);
      const { error: insertError } = await supabase
        .from("feedback")
        .insert({ user_id: user.id, category, message: trimmed });
      setLoading(false);
      if (insertError) {
        setError("Something went wrong sending your feedback. Please try again.");
        return false;
      }
      setSucceeded(true);
      return true;
    },
    [user?.id],
  );

  const reset = useCallback(() => {
    setError(null);
    setSucceeded(false);
  }, []);

  return { submit, loading, error, succeeded, reset };
}
