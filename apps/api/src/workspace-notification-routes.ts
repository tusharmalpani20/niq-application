import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import type { ApplicationService } from "./services/application";
import { ServiceError } from "./services/application";
import type { AssessmentWorkflowService } from "./services/assessment-workflow";
import { WorkspaceNotificationService } from "./services/workspace-notifications";

const id = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
const parseId = (value: string) => {
  const result = id.safeParse(value);
  if (!result.success) throw new ServiceError("VALIDATION_ERROR", "The request is invalid.");
  return result.data;
};

export function mountWorkspaceNotificationRoutes(
  app: Hono<any>, workflow: AssessmentWorkflowService, auth: ApplicationService, cookieName: string,
) {
  const notifications = new WorkspaceNotificationService(workflow);
  const base = "/v1/organizations/:organizationId";
  const org = (context: any) => parseId(context.req.param("organizationId"));
  app.use(`${base}/notifications*`, async (context, next) => { context.header("Cache-Control", "private, no-store"); await next(); });
  app.get(`${base}/notifications`, async context => context.json(await notifications.list(context.get("principal"), org(context))));
  app.post(`${base}/notifications/read-all`, async context => {
    await notifications.markAllRead(context.get("principal"), org(context));
    return context.json({ ok: true });
  });
  app.post(`${base}/notifications/dismiss-all`, async context => {
    await notifications.dismissAll(context.get("principal"), org(context));
    return context.json({ ok: true });
  });
  app.post(`${base}/notifications/:notificationId/read`, async context => {
    await notifications.markRead(context.get("principal"), org(context), parseId(context.req.param("notificationId")));
    return context.json({ ok: true });
  });
  app.post(`${base}/notifications/:notificationId/dismiss`, async context => {
    await notifications.dismiss(context.get("principal"), org(context), parseId(context.req.param("notificationId")));
    return context.json({ ok: true });
  });

  app.get(`${base}/live`, async context => {
    const organizationId = org(context);
    const actor = context.get("principal");
    // Check workspace access before opening a long-lived response.
    await notifications.changes(actor, organizationId, 0, 1);
    const token = getCookie(context, cookieName);
    const latest = await notifications.latestSequence(organizationId);
    const requested = Number(context.req.header("last-event-id"));
    let cursor = Number.isSafeInteger(requested) && requested >= 0 ? Math.min(requested, latest) : latest;
    const encoder = new TextEncoder();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const write = (value: string) => controller.enqueue(encoder.encode(value));
        const poll = async () => {
          if (stopped) return;
          try {
            const current = token ? await auth.authenticate(token) : null;
            if (!current || current.membershipId !== actor.membershipId || current.organizationId !== organizationId) {
              stopped = true; controller.close(); return;
            }
            // A durable cursor catches missed notifications and events from other API processes.
            for (let batch = 0; batch < 5; batch += 1) {
              const result = await notifications.changes(current, organizationId, cursor);
              for (const event of result.events) write(`event: change\ndata: ${JSON.stringify({ scope: event.scope, ...(event.assessmentId ? { assessmentId: event.assessmentId } : {}) })}\n\n`);
              if (result.lastSequence !== cursor) {
                cursor = result.lastSequence;
                // Advance the reconnect cursor only after every change in the batch is emitted.
                write(`event: cursor\nid: ${cursor}\ndata: {}\n\n`);
              }
              if (!result.hasMore) break;
            }
            write(": heartbeat\n\n");
          } catch (error) {
            stopped = true;
            try { controller.error(error); } catch { /* The browser disconnected. */ }
            return;
          }
          timer = setTimeout(poll, 5000);
        };
        write("retry: 5000\n\n");
        if (!context.req.header("last-event-id")) write('event: change\ndata: {"scope":"organization"}\n\n');
        void poll();
      },
      cancel() { stopped = true; if (timer) clearTimeout(timer); },
    });
    return new Response(body, { headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "private, no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    } });
  });
}
