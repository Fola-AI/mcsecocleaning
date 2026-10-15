/**
 * Keyboard skip-to-content link (WCAG 2.2 AA § 2.4.1 Bypass blocks, §8).
 *
 * Moved off-screen with a transform rather than with `sr-only` +
 * `focus:not-sr-only`. The utility pair looks neater and did not work: `sr-only`
 * pins the element to 1x1 with `clip`, and whether the `focus:` reversal wins
 * depends on the order the two rules end up in the stylesheet — in this build it
 * lost, so the link WAS focusable and did receive focus first, but rendered one
 * pixel wide. A sighted keyboard user pressing Tab saw nothing, which is the
 * whole point of the link. Caught by the gate in e2e/accessibility.spec.ts.
 *
 * The element here is always its full size and always in the accessibility tree;
 * only its position changes, and `transition-transform` is harmless to anyone
 * who has asked for reduced motion because it moves nothing they can see until
 * they focus it.
 */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="fixed left-4 top-4 z-50 -translate-y-24 rounded-lg bg-brand px-4 py-2 font-semibold text-white transition-transform focus:translate-y-0"
    >
      Skip to content
    </a>
  );
}
