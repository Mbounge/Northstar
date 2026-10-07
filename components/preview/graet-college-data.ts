export type CollegeRecord = {
  name: string;
  league: string;
  city: string;
  state: string;
  stateCode: string;
  size?: string;
  urbanicity?: string;
  zip?: string;
  sat?: number;
  tuition?: string;
  students?: string;
};

export const capturedColleges: CollegeRecord[] = [
  { name: "Hobart William Smith Colleges", league: "NCAA D3", city: "Geneva", state: "New York", stateCode: "NY", size: "Small (<3k)", urbanicity: "City", zip: "14456", sat: 1320, tuition: "$31.1K", students: "1.6K" },
  // The names, locations, and leagues below are captured. The remaining fields
  // are local mock values used to exercise filters and generic school pages.
  { name: "Minot State University", league: "ACHA D1", city: "Minot", state: "North Dakota", stateCode: "ND", size: "Small (<3k)", urbanicity: "City", zip: "58701", sat: 1050, tuition: "$8.5K", students: "2.5K" },
  { name: "University of Michigan", league: "NCAA D1", city: "Ann Arbor", state: "Michigan", stateCode: "MI", size: "Very Large (>15k)", urbanicity: "City", zip: "48109", sat: 1470, tuition: "$31K", students: "32K" },
  { name: "Adrian College", league: "NCAA D3", city: "Adrian", state: "Michigan", stateCode: "MI", size: "Small (<3k)", urbanicity: "City", zip: "49221", sat: 1070, tuition: "$23K", students: "1.7K" },
  { name: "Florida Gulf Coast University", league: "ACHA D2", city: "Fort Myers", state: "Florida", stateCode: "FL", size: "Large (9-15k)", urbanicity: "Suburban", zip: "33965", sat: 1120, tuition: "$17.8K", students: "14K" },
  { name: "Ohio University", league: "ACHA D1", city: "Athens", state: "Ohio", stateCode: "OH", size: "Very Large (>15k)", urbanicity: "City", zip: "45701", sat: 1200, tuition: "$22K", students: "21K" },
  { name: "Western Michigan University", league: "NCAA D1", city: "Kalamazoo", state: "Michigan", stateCode: "MI", size: "Very Large (>15k)", urbanicity: "City", zip: "49008", sat: 1130, tuition: "$19K", students: "17K" },
  { name: "Michigan State University", league: "NCAA D1", city: "East Lansing", state: "Michigan", stateCode: "MI", size: "Very Large (>15k)", urbanicity: "City", zip: "48824", sat: 1280, tuition: "$27K", students: "39K" },
  { name: "Utica University", league: "NCAA D3", city: "Utica", state: "New York", stateCode: "NY", size: "Small (<3k)", urbanicity: "City", zip: "13502", sat: 1120, tuition: "$26K", students: "2.7K" },
  { name: "Aurora University", league: "NCAA D3", city: "Aurora", state: "Illinois", stateCode: "IL", size: "Medium (3-9k)", urbanicity: "Suburban", zip: "60506", sat: 1090, tuition: "$21K", students: "4K" },
  { name: "Central Maine Community College", league: "ACHA D3", city: "Auburn", state: "Maine", stateCode: "ME", size: "Small (<3k)", urbanicity: "City", zip: "04210", sat: 980, tuition: "$7K", students: "2K" },
  { name: "Ogden-Weber Technical College", league: "ACHA D2", city: "Ogden", state: "Utah", stateCode: "UT", size: "Small (<3k)", urbanicity: "City", zip: "84404", tuition: "$6K", students: "1K" },
  { name: "University of Nevada, Las Vegas", league: "ACHA D1", city: "Las Vegas", state: "Nevada", stateCode: "NV", size: "Very Large (>15k)", urbanicity: "City", zip: "89154", sat: 1120, tuition: "$15K", students: "25K" },
  { name: "University of North Dakota", league: "NCAA D1", city: "Grand Forks", state: "North Dakota", stateCode: "ND", size: "Medium (3-9k)", urbanicity: "City", zip: "58202", sat: 1100, tuition: "$19K", students: "9K" },
];

// Coordinates are relative to the screenshot slices in the college list.
export const collegeCardSlices = {
  "college-74": [{ name: "Minot State University", top: 75 }, { name: "University of Michigan", top: 250 }, { name: "Adrian College", top: 425 }],
  "college-75": [{ name: "Florida Gulf Coast University", top: 13 }, { name: "Ohio University", top: 188 }, { name: "Western Michigan University", top: 363 }],
  "college-76": [{ name: "Michigan State University", top: 11 }, { name: "Utica University", top: 185 }, { name: "Aurora University", top: 360 }],
  "college-77": [{ name: "Central Maine Community College", top: 0 }, { name: "Ogden-Weber Technical College", top: 153 }, { name: "University of Nevada, Las Vegas", top: 328 }, { name: "University of North Dakota", top: 503 }],
} as const;
