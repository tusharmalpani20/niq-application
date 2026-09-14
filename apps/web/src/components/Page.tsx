import type { ReactNode } from "react";
import { AlertCircle, Plus, SearchX } from "lucide-react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <header className="page-header"><div>{eyebrow && <p className="page-eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{action && <div className="page-actions">{action}</div>}</header>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <Empty className="min-h-52"><EmptyHeader><EmptyMedia variant="icon"><Plus /></EmptyMedia><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader>{action && <EmptyContent>{action}</EmptyContent>}</Empty>;
}

export function ErrorState({ retry }: { retry?: () => void }) {
  return <Alert variant="destructive"><AlertCircle /><AlertTitle>We couldn’t load this information.</AlertTitle><AlertDescription>Please try again. No changes were lost.</AlertDescription>{retry && <AlertAction><Button variant="outline" size="sm" onPress={retry}>Retry</Button></AlertAction>}</Alert>;
}

export function NotFoundState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <Empty className="min-h-72"><EmptyHeader><EmptyMedia variant="icon"><SearchX /></EmptyMedia><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader>{action && <EmptyContent>{action}</EmptyContent>}</Empty>;
}

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground" role="status"><Spinner />{label}…</div>;
}
