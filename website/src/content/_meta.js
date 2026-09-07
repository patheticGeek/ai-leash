export default {
  index: "Overview",
  // "children": the "docs" folder itself doesn't show as a sidebar row —
  // its contents (currently just "features") get promoted up a level
  // instead of sitting under an extra "Docs" wrapper nobody needs to
  // click through. Routes are unaffected (still /docs/features/...).
  docs: {
    display: "children",
  },
};
