import { cn } from "../lib/cn";

type SectionHeadingProps = {
  title: string;
  description?: string;
  className?: string;
};

export function SectionHeading({
  title,
  description,
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn("max-w-[68ch]", className)}>
      <h2 className="relative w-fit text-28 font-medium leading-[1.15] text-fg md:text-38 md:leading-[1.15]">
        {title}
      </h2>
      {description && (
        <p className="mt-3 text-16 text-fg-muted">{description}</p>
      )}
    </div>
  );
}
