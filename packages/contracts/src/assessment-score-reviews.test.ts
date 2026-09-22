import { expect, test } from "bun:test";
import { projectScoreReviews, scoreReviewInputSchema, type ScoreReviewEntry } from "./assessment-score-reviews";
import type { AssessmentScoreResult } from "./assessment-workflow";
const result = {score:10, components:[{id:"a",sectionId:"s",points:8,status:"answered"},{id:"b",sectionId:"t",points:2,status:"answered"},{id:"c",sectionId:"u",points:null,status:"unanswered"}]} as AssessmentScoreResult;
const event=(revision:number,targetType:ScoreReviewEntry["targetType"],targetId:string|null,points:number|null)=>({revision,targetType,targetId,points}) as ScoreReviewEntry;
test("original scores unchanged and missing scores remain null",()=>{
 const before=JSON.stringify(result);const view=projectScoreReviews(result,[event(1,"item","a",5)]);
 expect(view.overall.reviewedPoints).toBe(7);expect(view.sections[0]?.niqPoints).toBe(8);expect(view.sections[2]?.reviewedPoints).toBeNull();expect(JSON.stringify(result)).toBe(before);
});
test("parent overrides persist, resetting reveals latest child total",()=>{
 const events=[event(1,"section","s",20),event(2,"overall",null,50),event(3,"item","a",3)];
 expect(projectScoreReviews(result,events).overall.reviewedPoints).toBe(50);
 events.push(event(4,"overall",null,null));expect(projectScoreReviews(result,events).overall.reviewedPoints).toBe(22);
 events.push(event(5,"section","s",null));expect(projectScoreReviews(result,events).overall.reviewedPoints).toBe(5);
 events.push(event(6,"item","a",null));expect(projectScoreReviews(result,events).overall.reviewedPoints).toBe(10);
});
test("zero override is preserved and inputs reject invalid target and numeric values",()=>{
 expect(projectScoreReviews(result,[event(1,"item","a",0)]).overall.reviewedPoints).toBe(2);
 const input={reason:"Clinical review",expectedResultReference:"result-1",expectedRevision:0,requestKey:"test-request-123456",targetType:"overall",targetId:null,points:0};
 expect(scoreReviewInputSchema.safeParse(input).success).toBe(true);
 for(const delta of [{expectedResultReference:undefined},{expectedResultReference:""},{reason:undefined},{reason:""},{reason:"   "},{points:-1},{points:Infinity},{points:NaN},{targetId:"x"},{targetType:"item"},{reason:"x".repeat(1001)}])expect(scoreReviewInputSchema.safeParse({...input,...delta}).success).toBe(false);
});

test("restoring scores also requires a reason",()=>{
 const input={expectedResultReference:"result-1",expectedRevision:1,requestKey:"restore-request-12345",targetType:"overall",targetId:null,points:null};
 expect(scoreReviewInputSchema.safeParse(input).success).toBe(false);
 expect(scoreReviewInputSchema.parse({...input,reason:"  Restore calculated total  "}).reason).toBe("Restore calculated total");
});

test("scan overrides are tied to their scan and excluded from questionnaire totals", () => {
 const entries=[event(1,"scan","scan-1",0)];
 const reviewed=projectScoreReviews(result,entries,{id:"scan-1",points:8});
 expect(reviewed.scan?.reviewedPoints).toBe(0);
 expect(reviewed.overall.reviewedPoints).toBe(10);
 const next=projectScoreReviews(result,entries,{id:"scan-2",points:5});
 expect(next.scan?.reviewedPoints).toBe(5);
 expect(next.scan?.overridden).toBe(false);
 expect(next.entries).toHaveLength(1);
});
