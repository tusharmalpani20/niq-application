# Local clinical workspace performance baseline — 5 October 2026

## Scope and method

- Measured the running local development application at `http://localhost:5173` as the Demo organization's Example Doc account. No production or CarePlix traffic was used.
- Dataset at measurement: 3,010 visible patients, 6,026 visible assessments (5,502 completed), and 3 facilities. It includes the marked `PERF-20261005` synthetic dataset.
- Browser timing starts immediately before a fresh route navigation and stops when the specified data appears in the accessibility tree. This is a **data-ready observation**, including navigation, API work, and rendering. It is not a Chrome paint metric. Polling adds some overhead; the numbers are suitable for comparing changes under the same method, not for an external service-level promise.
- Five to twelve warm repeated navigations per route. Background work on this development machine caused occasional outliers; both typical and maximum values are retained below. Machine: 16 logical CPUs, 15 GiB RAM, load average approximately 2.2 at the end of the run.
- Read-only service timings call the same application service methods as the API for this account, five times each, against the local PostgreSQL database. Payload sizes are uncompressed `JSON.stringify` byte lengths before the HTTP envelope. They exclude browser parsing and rendering.

## Browser data-ready timings

| Route | Ready condition | Samples | Mean | Median | Observed range | P90 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `/assessments` | 6,026 count shown | 12 | 2,595 ms | 2,321 ms | 1,528–6,791 ms | 3,209 ms |
| `/patients` | 3,010 rows known and assessment-date loading finished | 6 | 1,348 ms | 1,233 ms | 1,204–1,617 ms | 1,617 ms |
| `/patients/PAT-11` | Latest assessment and NIQ score trend ready | 5 | 1,126 ms | 1,057 ms | 1,023–1,311 ms | 1,311 ms |
| `/facilities` | 3 facility rows shown | 12 | 928 ms | 689 ms | 623–3,392 ms | 883 ms |
| `/` | Patient and high-risk dashboard statistics populated | 5 | 3,131 ms | 3,145 ms | 2,856–3,380 ms | 3,380 ms |
| `/assessments/ASM-000029` | Completed assessment summary and final score ready | 5 | 919 ms | 946 ms | 853–960 ms | 960 ms |
| `/facilities/che-c` | Facility overview ready | 5 | 1,981 ms | 2,003 ms | 1,684–2,411 ms | 2,411 ms |

The patient list first shows rows before the Last assessment column is always ready. In a separate seven-run burst, first-row readiness ranged from 2,283 to 4,383 ms while the local machine was busier. The repeat run above measured complete table readiness after that burst.

Normal in-app navigation, four samples each, showed these ranges: Assessments 2,223–4,048 ms; Patients 952–3,770 ms; Dashboard 229–616 ms to first statistics; Facilities 246–1,234 ms. The dashboard's **full risk statistic** took about 3.1 seconds on fresh navigations, so its quick first-statistic timing does not mean the whole dashboard is ready.

## Read-service timings and data volume

| Application service | Mean of 5 | Median | Maximum | Uncompressed result | Rows |
| --- | ---: | ---: | ---: | ---: | ---: |
| `listAssessments` | 345 ms | 324 ms | 456 ms | 2,951,727 bytes | 6,026 |
| `listPatients` | 51 ms | 44 ms | 83 ms | 1,182,704 bytes | 3,010 |
| `listFacilities` | 2 ms | 1 ms | 4 ms | 717 bytes | 3 |
| `getPatient` | 1 ms | 1 ms | 2 ms | 394 bytes | 1 |
| `getFacilityPerformance` | 236 ms | 234 ms | 243 ms | 745 bytes | 1 summary |
| `getOverviewSummary` | 112 ms | 111 ms | 136 ms | 2,956 bytes | 1 summary |
| `getOverviewRisk` | 891 ms | 924 ms | 941 ms | 59,883 bytes | 1 result |

Raw service timings (ms): `listAssessments` 456, 337, 303, 324, 305; `listPatients` 83, 44, 52, 36, 41; `getFacilityPerformance` 243, 231, 241, 232, 234; `getOverviewSummary` 136, 111, 121, 93, 98; `getOverviewRisk` 924, 831, 833, 927, 941.

## Findings to test in the next optimization pass

1. The assessment page requests every visible assessment even though its table is paginated in the browser. The service returns about 3 MB, and the browser parses and filters 6,026 records.
2. The patient page requests all 3,010 patients **and** all 6,026 assessments to calculate each patient's last assessment and sort order. It can show the table while the assessment-derived column is still loading.
3. Patient details fetch one patient and then the full assessment list before filtering to that patient's history. The observed patient has two assessments.
4. Facility details fetch all facilities, patients, and assessments, then filter in the browser and separately fetch facility performance. This makes one detail page dependent on both large list responses.
5. Dashboard risk data is the slowest measured read service (about 0.9 seconds). Its cards populate in stages; the full dashboard was about 3.1 seconds in the repeated browser runs.

These measurements support starting with server-side paging and filtered patient/facility assessment queries, then reviewing the risk aggregation. Animation smoothness, frame rate, LCP, and interaction latency were not measured in this pass; record those with a browser performance trace after the data-loading baseline is improved.

## Assessment list after the first optimization

The assessment page now requests one server-filtered page of 10 results. The API scans visible assessment headers to keep tab counts and legacy ownership rules exact, then decrypts patient names and resolves risk categories for the requested page. Name and risk filters still require broader work because those values are encrypted. The separate clinical review queue continues to use its own endpoint.

| Measurement | Before | After |
| --- | ---: | ---: |
| Browser data-ready mean | 2,595 ms (12 runs) | 1,118 ms (5 warm reloads) |
| Browser data-ready median | 2,321 ms | 1,130 ms |
| Read service mean | 345 ms (5 calls) | 56 ms (5 calls) |
| Uncompressed JSON result | 2,951,727 bytes, 6,026 rows | 5,079 bytes, 10 rows |

Post-change browser samples (ms): 1,130, 1,031, 1,122, 1,155, 1,152. Post-change direct service samples (ms): 95, 46, 47, 46, 46. The samples were collected on the same local development stack, but machine load and sample counts were not controlled. The browser method includes page readiness polling rather than paint or Web Vitals metrics. Page 2, assessment ID search, and the original tab counts were checked in the signed-in application.

No database index was added in this pass. The current header scan is needed for exact counts and legacy visibility checks, so an index on creation time alone would not remove that work. A later pass can evaluate query plans if larger data volumes make the scan significant.
