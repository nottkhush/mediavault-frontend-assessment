/**
 * Persistent and visually hidden. Screen readers announce changes to its text,
 * and only when the text really changes.
 */
export function LiveRegion({ message }: { message: string }) {
  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
}