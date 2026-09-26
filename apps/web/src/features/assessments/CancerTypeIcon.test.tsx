import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { buildAssessmentForm } from "@niq/application-contracts";
import { assessmentQuestionnaireFixture } from "./test-fixture";
import { CancerTypeIcon } from "./CancerTypeIcon";

test("every cancer option has a decorative icon", () => {
  const form = buildAssessmentForm(assessmentQuestionnaireFixture());
  const options = form.sections.find(section => section.id === "disease_status")!.fields.find(field => field.id === "cancer_type")!.options!;
  expect(options).toHaveLength(24);
  for (const option of options) {
    const markup = renderToStaticMarkup(<CancerTypeIcon type={option.id} />);
    expect(markup).toContain(`data-cancer-icon="${option.id}"`);
    expect(markup).toContain('aria-hidden="true"');
  }
});
