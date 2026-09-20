import { expect, test } from "bun:test";
import { loadApplicationConfig } from "@niq/application-config";
import { frozenFaceScanContext } from "./assessment-face-scan";
import { faceScanSignalSchema, startFaceScanSchema } from "../../../../packages/contracts/src/face-scan";
test("new capture is unavailable by default",()=>expect(loadApplicationConfig({DATABASE_URL:"postgres://test",SESSION_SECRET:"test-secret-that-is-at-least-32-characters"}).FACE_SCAN_ENABLED).toBe(false));
test("snapshot derives real patient demographics and saved measurements",()=>{
 expect(frozenFaceScanContext({dateOfBirth:"1990-05-01",gender:"FEMALE"},{height_cm:170,current_weight_kg:65},"deployment:operator")).toEqual({dob:"1990-05-01",gender:"female",heightCm:170,weightKg:65,posture:"resting",employeeId:"deployment:operator"});
 for(const patient of [{dateOfBirth:null,gender:"FEMALE"},{dateOfBirth:"1990-05-01",gender:"OTHER"}])expect(()=>frozenFaceScanContext(patient,{height_cm:170,current_weight_kg:65},"operator")).toThrow();
 expect(()=>frozenFaceScanContext({dateOfBirth:"1990-05-01",gender:"MALE"},{height_cm:170},"operator")).toThrow();
});
test("start rejects caller supplied patient context and requires a saved revision",()=>{
 expect(startFaceScanSchema.safeParse({revision:2,requestKey:"test-request-key-12345",posture:"resting"}).success).toBe(true);
 expect(startFaceScanSchema.safeParse({revision:2,requestKey:"test-request-key-12345",posture:"resting",dob:"2000-01-01"}).success).toBe(false);
 expect(startFaceScanSchema.safeParse({posture:"resting"}).success).toBe(false);
});
test("bounded signal validates measured RGB shape and aligned increasing timings",()=>{
 const signal={raw_intensity:[{r:1,g:2,b:3},{r:2,g:3,b:4}],ppg_time:[0,1],average_fps:30};
 expect(faceScanSignalSchema.safeParse(signal).success).toBe(true);
 for(const changes of [{ppg_time:[1,1]},{ppg_time:[1]},{average_fps:Infinity},{raw_intensity:[[1,2,3],[2,3,4]]},{raw_intensity:Array(12001).fill({r:1,g:1,b:1}),ppg_time:Array.from({length:12001},(_,i)=>i)}])expect(faceScanSignalSchema.safeParse({...signal,...changes}).success).toBe(false);
});
