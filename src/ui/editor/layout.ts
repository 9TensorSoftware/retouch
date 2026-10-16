/**
 * When the editor stacks: the stage on top, the controls as a bottom sheet,
 * the tools in a row along the bottom. Narrow windows (except a phone on
 * its side, which keeps the three columns) and upright tablets. The
 * stylesheet repeats this query; keep the two in step.
 */
export const STACKED_QUERY =
  "(max-width: 760px) and (min-height: 501px), (max-width: 1024px) and (orientation: portrait)";
