// ──────────────────────────────────────────────────────────────────────
// WHAT: Fixed lists that never come from the database: WK1-9 and SDG1-17 (names, descriptions,
//       SDG colours), K-levels, level labels and semesters. Used by the grids, the PDF and the AI prompt.
// ──────────────────────────────────────────────────────────────────────

// Fixed reference lists used by the editor, the PDF and the AI prompt.

export type Kind = "WK" | "SDG";

/** Washington Accord knowledge profile (NBA Annexure I). */
export const WK: { num: number; name: string; description: string }[] = [
  { num: 1, name: "Natural Sciences & Social Awareness", description: "Theory-based natural sciences relevant to the discipline, with awareness of relevant social sciences." },
  { num: 2, name: "Mathematics, Numerical Data Analysis & Modelling", description: "Mathematics, numerical methods, data analysis, statistics and computing foundations for detailed engineering analysis and modelling." },
  { num: 3, name: "Engineering Fundamentals", description: "Systematic, theory-based engineering fundamentals required by the discipline." },
  { num: 4, name: "Specialist Engineering Knowledge", description: "Specialist engineering theory and knowledge for accepted practice areas, including knowledge at the disciplinary forefront." },
  { num: 5, name: "Engineering Design & Operations", description: "Engineering design and operations knowledge considering resource efficiency, environmental impacts, lifetime costs, reuse and net-zero carbon." },
  { num: 6, name: "Engineering Practice/Technology", description: "Engineering practice and technology in the relevant engineering practice areas." },
  { num: 7, name: "Role Of Engineering In Society, Safety & Sustainable Development", description: "Engineering responsibilities to society, public safety and sustainable development." },
  { num: 8, name: "Research Literature & Emerging Engineering Knowledge", description: "Engagement with current research literature and critical and creative thinking about emerging disciplinary issues." },
  { num: 9, name: "Ethics and professional engineering conduct", description: "Professional ethics, responsibilities, practice norms, diversity, mutual respect and inclusive conduct." },
];

/** UN Sustainable Development Goals. */
export const SDG: { num: number; name: string; description: string; color: string }[] = [
  { num: 1, name: "No Poverty", description: "End poverty in all its forms everywhere", color: "#E5243B" },
  { num: 2, name: "Zero Hunger", description: "End hunger, achieve food security, and promote sustainable agriculture", color: "#DDA63A" },
  { num: 3, name: "Good Health and Well-Being", description: "Ensure healthy lives and promote well-being for all at all ages", color: "#4C9F38" },
  { num: 4, name: "Quality Education", description: "Ensure inclusive and equitable quality education and promote lifelong learning opportunities", color: "#C5192D" },
  { num: 5, name: "Gender Equality", description: "Achieve gender equality and empower all women and girls", color: "#FF3A21" },
  { num: 6, name: "Clean Water and Sanitation", description: "Ensure availability and sustainable management of water and sanitation", color: "#26BDE2" },
  { num: 7, name: "Affordable and Clean Energy", description: "Ensure access to affordable, reliable, sustainable, and modern energy", color: "#FCC30B" },
  { num: 8, name: "Decent Work and Economic Growth", description: "Promote sustained, inclusive, and sustainable economic growth, full and productive employment, and decent work", color: "#A21942" },
  { num: 9, name: "Industry, Innovation, and Infrastructure", description: "Build resilient infrastructure, promote inclusive and sustainable industrialization, and foster innovation", color: "#FD6925" },
  { num: 10, name: "Reduced Inequalities", description: "Reduce inequality within and among countries", color: "#DD1367" },
  { num: 11, name: "Sustainable Cities and Communities", description: "Make cities and human settlements inclusive, safe, resilient, and sustainable", color: "#FD9D24" },
  { num: 12, name: "Responsible Consumption and Production", description: "Ensure sustainable consumption and production patterns", color: "#BF8B2E" },
  { num: 13, name: "Climate Action", description: "Take urgent action to combat climate change and its impacts", color: "#3F7E44" },
  { num: 14, name: "Life Below Water", description: "Conserve and sustainably use the oceans, seas, and marine resources", color: "#0A97D9" },
  { num: 15, name: "Life on Land", description: "Protect, restore, and promote sustainable use of terrestrial ecosystems, forests, and biodiversity", color: "#56C02B" },
  { num: 16, name: "Peace, Justice, and Strong Institutions", description: "Promote peaceful and inclusive societies, provide access to justice, and build effective, accountable institutions", color: "#00689D" },
  { num: 17, name: "Partnerships for the Goals", description: "Strengthen the means of implementation and revitalize global partnerships for sustainable development", color: "#19486A" },
];

export const COUNT: Record<Kind, number> = { WK: 9, SDG: 17 };
export const K_LEVELS = ["K1", "K2", "K3", "K4", "K5", "K6"];
export const LEVEL_LABEL = ["–", "Low", "Medium", "High"];

export const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];
