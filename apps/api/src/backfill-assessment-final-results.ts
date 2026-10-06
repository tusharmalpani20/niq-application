import { loadApplicationConfig } from "@niq/application-config";
import { and, eq, gt } from "drizzle-orm";
import { createDatabase } from "./db/client";
import { assessments } from "./db/schema";
import { decryptPatientData, patientDataKey } from "./security/patient-data";
import { finalResultFromSnapshot } from "./services/overview-risk";

const config = loadApplicationConfig(process.env);
const { db, sql } = createDatabase(config);
const key = patientDataKey(config.PATIENT_DATA_ENCRYPTION_KEY, config.SESSION_SECRET);
let lastId = "";
let updated = 0;

try {
  for (;;) {
    const rows = await db.select({
      id: assessments.id,
      organizationId: assessments.organizationId,
      clinicalReview: assessments.clinicalReview,
    }).from(assessments)
      .where(and(eq(assessments.status, "COMPLETED"), gt(assessments.id, lastId)))
      .orderBy(assessments.id).limit(100);
    if (!rows.length) break;

    for (const row of rows) {
      const encrypted = (row.clinicalReview as { encrypted?: string } | null)?.encrypted;
      if (!encrypted) throw new Error(`Missing final review for assessment ${row.id}`);
      const review = JSON.parse(decryptPatientData(Buffer.from(encrypted, "base64"), key)) as {
        finalSnapshot?: { score?: { overall?: { reviewedPoints?: number | null } } };
      };
      if (!review.finalSnapshot) throw new Error(`Missing final snapshot for assessment ${row.id}`);
      const { finalScore: score, finalRiskCategory: category } = finalResultFromSnapshot(review.finalSnapshot);
      const [result] = await sql<{ backfill_assessment_final_result: boolean }[]>`
        select backfill_assessment_final_result(${row.organizationId}, ${row.id}, ${score}, ${category})
      `;
      if (!result?.backfill_assessment_final_result) throw new Error(`Assessment ${row.id} is no longer completed`);
      updated++;
    }
    lastId = rows.at(-1)!.id;
  }
  console.info(`Backfilled ${updated} completed assessment results.`);
} finally {
  await sql.end();
}
