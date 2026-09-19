import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";

/** Dates stay compact while the full local timestamp is available to keyboard and pointer users. */
export function DateDisplay({ value }: { value: Date }) {
  const date = value.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const timestamp = value.toLocaleString("en-GB", { dateStyle: "long", timeStyle: "long" });
  return <TooltipTrigger><Button variant="ghost" className="h-auto justify-start whitespace-normal p-0 text-inherit font-normal hover:bg-transparent" aria-label={timestamp}><time dateTime={value.toISOString()}>{date}</time></Button><Tooltip>{timestamp}</Tooltip></TooltipTrigger>;
}
