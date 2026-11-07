/** Section title with the small themed label above it. */
export default function SectionHeading({ id, eyebrow, title, centered = false }) {
  return (
    <div className={`mb-10 flex items-end gap-4 ${centered ? "justify-center text-center" : ""}`}>
      <div>
        {eyebrow && <p className="mb-2 font-mono text-xs uppercase tracking-[0.25em] text-cyan/80">{eyebrow}</p>}
        <h2 id={id} className="text-2xl font-bold tracking-wide text-white md:text-3xl">
          {title}
        </h2>
      </div>
      {!centered && <div className="mb-2 h-px flex-1 bg-gradient-to-r from-cyan/40 to-transparent rtl:bg-gradient-to-l" />}
    </div>
  );
}
