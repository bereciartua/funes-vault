export function FeedbackMessages({
  error,
  message
}: {
  error?: string | null;
  message?: string | null;
}) {
  return (
    <>
      {message ? (
        <p className="success" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
