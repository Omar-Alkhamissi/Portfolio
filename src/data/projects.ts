import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Building2,
  ChartColumnIncreasing,
  FileText,
  Gamepad2,
  Gem,
  GraduationCap,
  HandCoins,
  Heart,
  Calculator,
  LifeBuoy,
  Layers,
  Landmark,
  Grid3x3,
  UtensilsCrossed,
  MessagesSquare,
  Plane,
  CalendarDays,
  FlaskConical,
  Coffee,
  PenTool,
  KeyRound,
  Database,
  Stethoscope,
  ShoppingCart,
  TreePine,
  Users,
} from "lucide-react";

export type Project = {
  title: string;
  blurb: string;
  description: string;
  tech: string[];
  bullets: string[];
  metrics: string[];
  stats: ProjectStat[];
  relations: ProjectRelation[];
  github: string;
  liveDemo?: string;
  icon: LucideIcon;
};

export type ProjectStat = {
  label: string;
  value: string;
  detail?: string;
};

export type ProjectRelation =
  | "Full-Stack"
  | "Frontend SPA"
  | "Backend APIs"
  | "External APIs"
  | "Database"
  | "SQL / Relational DB"
  | "MongoDB / NoSQL"
  | "Authentication"
  | "Payments"
  | "Testing"
  | "Real-Time"
  | "Mobile"
  | "Cloud / Deployment"
  | "Local Storage"
  | "Data Processing"
  | "Algorithms"
  | "Custom Data Structures"
  | "Design Patterns"
  | "Desktop GUI"
  | "gRPC / Microservices"
  | "File Uploads"
  | "Reporting / PDF"
  | "Admin Dashboard"
  | "SQL Procedures"
  | "Parsing / Compilers"
  | "Document Generation"
  | "Game Development";

type ProjectBase = Omit<Project, "metrics" | "relations" | "stats">;

const GH = "https://github.com/Omar-Alkhamissi";
const repo = (name: string) => `${GH}/${name}`;

const rawProjects: ProjectBase[] = [
  {
    title: "Debug My Heart",
    icon: Heart,
    blurb: "MERN dating platform — Database Lead, team of 5",
    description:
      "A 5,921-LOC MERN dating app with weighted compatibility matching, JWT auth, Stripe-gated subscriptions, and a 6-suite Jest test harness — built as Database Lead in a team of 5.",
    tech: ["React 18", "Node.js", "Express", "MongoDB", "Stripe", "JWT", "Jest"],
    bullets: [
      "Engineered a 5-factor weighted compatibility algorithm scoring users on skills, tech stack, interests, location, and intent into a normalized 0–100% match across 14 authenticated pages and 6 MongoDB models.",
      "Implemented JWT auth with bcryptjs (salt=10), middleware-based role checks, and React Context token persistence; protected routes via compound DB indexes for sub-100ms mutual-match lookups.",
      "Integrated Stripe Subscription API ($5/month) with idempotent checkout sessions and metadata linking, gating contact info behind verified payment status; built a 6-suite Jest + Supertest harness using mongodb-memory-server for isolated integration tests.",
      "Owned database-facing integration concerns by aligning compatibility scoring, auth persistence, payment gating, and upload handling around the same user/match model.",
    ],
    github: repo("Debug-My-Heart"),
  },
  {
    title: "Expression Evaluator",
    icon: Calculator,
    blurb: "C++20 coursework compiler pipeline — tokenizer → parser → RPN",
    description:
      "A coursework-framed expression evaluation pipeline (7,237 LOC, 41 files) separating tokenization, parsing, RPN conversion, and evaluation into independent C++20 components with a clean facade.",
    tech: ["C++20", "STL", "shared_ptr", "RAII"],
    bullets: [
      "Architected a 5-stage pipeline (tokens → tokenizer → parser → RPN → evaluator) with each stage as an independent, reusable component across 41 files and 7,237 lines of C++20.",
      "Designed a type-safe token hierarchy (Token base → Operand/Operator subclasses) with shared_ptr RAII, supporting 10+ token types without runtime casting or manual memory management.",
      "Implemented Reverse Polish Notation conversion with operator precedence and parenthesis resolution, enabling correct evaluation of arbitrarily nested expressions behind a single evaluate(string) facade call.",
      "Kept parser/evaluator boundaries testable by exposing a single facade while preserving independent tokenization, parsing, conversion, and evaluation stages.",
    ],
    github: repo("Programming"),
  },
  {
    title: "Employee Helpdesk Portal",
    icon: LifeBuoy,
    blurb: "N-tier ASP.NET Core helpdesk with xUnit coverage",
    description:
      "A 4-layer N-tier helpdesk (Controllers → ViewModels → DAOs → IRepository<T>) with optimistic concurrency detection, xUnit test coverage, image handling, and generated helpdesk reports.",
    tech: ["ASP.NET Core", "EF Core", "SQL Server", "xUnit", "PDF Reports"],
    bullets: [
      "Designed a 4-layer N-tier architecture across 28 files with clean layer isolation and a generic IRepository<T> interface eliminating CRUD duplication across 4 entity types.",
      "Implemented optimistic concurrency detection using UpdateStatus return codes (-2 = stale data) preventing silent overwrites without pessimistic table locks.",
      "Built DAO and ViewModel test coverage around the helpdesk data layer, plus report endpoints and generated PDF outputs for call and employee reporting.",
      "Handled binary image/file payloads through ViewModel and DAO paths so reporting and employee records stayed within the same layered contract.",
    ],
    github: repo("EmployeePortal"),
  },
  {
    title: "Wordle gRPC Microservices",
    icon: Grid3x3,
    blurb: "3-tier .NET 9 gRPC system with bidirectional streaming",
    description:
      "A 3-service Wordle implementation: WordServer provides daily seeded words, WordleGameServer manages a 6-guess loop, and a dual-threaded console client renders ANSI-color feedback over gRPC streams.",
    tech: ["C# .NET 9", "gRPC", "Protobuf", "HTTP/2", "Mutex"],
    bullets: [
      "Architected a 3-tier gRPC microservice system (.NET 9) with bidirectional streaming RPCs and a deterministic daily word seeded by Random(YYYYMMDD).",
      "Implemented a two-pass Wordle evaluation algorithm — first marks exact positions and builds a frequency map, second checks wrong-position letters against remaining frequency — correctly handling duplicate letters without over-marking.",
      "Designed thread-safe stats persistence using a named System.Threading.Mutex protecting game_stats.json from concurrent writes across simultaneous multi-player completions.",
      "Separated word generation, gameplay orchestration, and client rendering so each gRPC service can evolve independently while sharing Protobuf contracts.",
    ],
    github: repo("Programming"),
  },
  {
    title: "Fast Food Ordering",
    icon: UtensilsCrossed,
    blurb: "ASP.NET 8 + Vue 3 ordering platform",
    description:
      "A full-stack ordering platform with EF Core code-first migrations, RFC2898 password hashing, JWT auth, and a Vue 3 + Quasar frontend served via async DB transactions.",
    tech: ["ASP.NET Core 8", "Vue 3", "EF Core", "JWT", "Swagger", "Quasar"],
    bullets: [
      "Architected an EF Core Code-First model with 5 relational tables, FK constraints, and SQL Server LocalDB; generated migrations tracking schema evolution across iterations.",
      "Implemented RFC2898DeriveBytes password hashing (10,000 iterations, 64-byte salt) and JWT generation with symmetric HMAC-SHA256 signing, configurable via appsettings.json.",
      "Designed an async transaction (BeginTransactionAsync → CommitAsync → RollbackAsync) atomically creating a Tray, inserting line items, and computing 9 nutrition totals in one rollback-safe operation.",
      "Connected the Vue/Quasar ordering UI to Swagger-documented APIs, keeping menu browsing, tray assembly, and nutrition feedback aligned with backend transactions.",
    ],
    github: repo("FastFoodOrdering"),
  },
  {
    title: "Real-Time Room Chat App",
    icon: MessagesSquare,
    blurb: "Socket.IO chat with /edit, /del, typing indicators",
    description:
      "A real-time chat platform with Socket.IO bidirectional pub/sub, slash-command message editing, multi-user typing indicators, and per-user color allocation across rooms.",
    tech: ["Node.js", "Express", "Socket.IO", "React 19", "MUI 7"],
    bullets: [
      "Architected real-time messaging using Socket.IO 4.8 with room-based isolation, per-user color assignment from a 75-entry palette with Set-based deduplication, and automatic color release on disconnect.",
      "Engineered a message mutation system with /edit and /del slash-commands, soft-delete flags (deletedAt), edit timestamps, and conditional rendering for mutation metadata.",
      "Built a server-side Room class managing message log, typing user set, and member list — handling edge cases like multi-user typing pluralization (\"X and Y are typing...\") and day-boundary separators via date-fns.",
      "Preserved room state on the server instead of trusting client-only history, giving reconnects, message edits, and typing presence one authoritative source.",
    ],
    github: repo("Programming"),
  },
  {
    title: "Travel Advisory Tracker",
    icon: Plane,
    blurb: "Government API ETL with MongoDB & React",
    description:
      "A full-stack travel advisory tracker that ingests live government data, joins ISO 3166-1 country metadata, and surfaces it through a React + MUI bookmarkable UI.",
    tech: ["Node.js", "Express", "MongoDB", "React 19", "MUI"],
    bullets: [
      "Engineered a data ingestion pipeline consuming a live government travel advisory API, normalizing timestamps, left-joining 118 ISO 3166-1 countries, and upserting merged records into 3 MongoDB collections.",
      "Built a repository abstraction layer (db.js) with parameterized queries and projection optimization — advisory text excluded from list views, included in detail views — to reduce payload size.",
      "Designed a POST /db/refresh endpoint triggering full database drop/recreate for daily synchronization, with NULLIF-safe aggregations and optional chaining preventing null reference errors on empty data.",
      "Separated refresh-time ETL from read-time endpoints so the UI can browse stable advisory snapshots while updates rebuild the backing collections.",
    ],
    github: repo("Programming"),
  },
  {
    title: "Khronos Calendar Library",
    icon: CalendarDays,
    blurb: "C++17 cross-calendar dates via Julian Day hub",
    description:
      "A C++17 library converting between Gregorian, Julian, Hebrew, and Islamic calendars (4,055 LOC, 42 files) using Julian Day Number as a universal interchange hub.",
    tech: ["C++17", "STL"],
    bullets: [
      "Designed a multi-calendar system with 5 calendar implementations using Julian Day Number as the universal interchange hub, enabling O(1) cross-calendar conversion without N×N direct converters.",
      "Implemented bidirectional conversion functions (gregorian_to_jd, jd_to_gregorian, hebrew_to_jd, etc.) incorporating astronomical algorithms for historical and religious calendar systems.",
      "Developed a 200+ test case suite validating round-trip conversions (Gregorian → JD → Gregorian), leap year edge cases, and religious calendar boundary conditions.",
      "Encapsulated calendar-specific leap-year and month rules behind shared date interfaces so adding calendar systems does not disturb existing conversions.",
    ],
    github: repo("Khronos"),
  },
  {
    title: "Stoichiometry Library",
    icon: FlaskConical,
    blurb: ".NET 9 chemical formula parser & periodic table",
    description:
      "A library + CLI parsing chemical formulas with multi-pass recursive descent, lazy-loaded periodic table from CSV, and a 5-rule validation pipeline (1,353 LOC, 8 files).",
    tech: ["C# .NET 9", "CsvHelper", "Recursive Parsing"],
    bullets: [
      "Built a multi-pass recursive descent tokenizer handling two-char element symbols, multi-digit subscripts, parenthetical groups with scalar multipliers, and duplicate element aggregation.",
      "Implemented a 5-rule validation pipeline (null safety → symbol lookup → parenthesis matching → nesting rejection → subscript positioning) with descriptive errors per rule failure.",
      "Integrated CsvHelper 33.1 with attribute-driven field mapping to lazy-load 118 elements, cached via a double-check singleton, and shipped a library/CLI split with /f:filepath batch processing.",
      "Kept formula parsing reusable by separating library behavior from CLI batch mode, letting the same parser handle interactive formulas and file-driven workloads.",
    ],
    github: repo("Programming"),
  },
  {
    title: "Coffee Shop POS",
    icon: Coffee,
    blurb: ".NET 8 POS — State + Bridge + Decorator patterns",
    description:
      "A point-of-sale showcase implementing three Gang-of-Four patterns in one cohesive system: State for order lifecycle, Bridge for brewing, Decorator for customization.",
    tech: ["C# .NET 8", "Design Patterns", "OOP"],
    bullets: [
      "Implemented a 4-state POS state machine (TakingOrder → Preparing → Payment → Pickup) using IOrderState polymorphic objects encapsulating transitions inside a CoffeeShop context class.",
      "Applied the Bridge pattern decoupling Drink abstraction from IBrewer implementations (AutomaticMachine, ManualSteamer), enabling runtime brew selection without modifying drink classes.",
      "Designed a recursive Decorator hierarchy stacking Cost() and Description() aggregation across MilkDecorator, SyrupDecorator, and WhipDecorator to support 10+ drink combinations.",
      "Kept pattern examples cohesive by making state transitions, brew behavior, and add-on pricing cooperate inside one POS flow instead of isolated demos.",
    ],
    github: repo("CoffeeShopPOS"),
  },
  {
    title: "Collaborative Drawing App",
    icon: PenTool,
    blurb: ".NET 8 multi-user canvas — Mediator + Observer + Memento",
    description:
      "A multi-user drawing system implementing Mediator (command routing), Observer (broadcast updates), and Memento (full undo/redo with shape snapshots).",
    tech: ["C# .NET 8", "Design Patterns", "OOP"],
    bullets: [
      "Architected a Mediator (DrawingMediator, 190 LOC) coordinating multi-user sessions, parsing 3 shape types with coordinate validation and routing state updates without direct user coupling.",
      "Implemented Observer with sender-exclusion logic (ReferenceEquals) ensuring shape additions broadcast to all observers except the originating user.",
      "Designed a Memento-based undo/redo system (CanvasCaretaker + CanvasMemento) maintaining immutable snapshots with CanUndo/CanRedo guards and informative diff messages identifying the reverted shape.",
      "Separated command routing, broadcast delivery, and history snapshots so collaboration behavior stays understandable under multi-user edits.",
    ],
    github: repo("CollaborativeDrawingApp"),
  },
  {
    title: "Enigma Machine Simulator",
    icon: KeyRound,
    blurb: "Java Swing simulator of the WWII rotor cipher",
    description:
      "A historically accurate Enigma machine simulator with MVC architecture, 3-rotor signal propagation, and an interactive GUI with 52 positioned key/lamp elements.",
    tech: ["Java", "Swing", "MVC", "Observer"],
    bullets: [
      "Implemented 3-rotor signal propagation with forwardMap/backwardMap permutation arrays and O(1) character translation via modulo arithmetic ((idx + offset) % 26).",
      "Engineered odometer-style rotor stepping with automatic carry propagation (fast → medium → slow) and bidirectional signal flow (keyboard → rotors → reflector → rotors → lamp).",
      "Rendered an interactive GUI with 52 dynamically positioned elements, real-time key/lamp color feedback, ImageIO-loaded background assets, and Observer pattern for decoupled view updates.",
      "Mapped cipher logic separately from Swing rendering so rotor stepping and lamp feedback remain testable outside the visual shell.",
    ],
    github: repo("EnigmaProject"),
  },
  {
    title: "Order Management System",
    icon: Database,
    blurb: "T-SQL system with nested cursors & UDFs",
    description:
      "A full T-SQL relational system with 8 tables, 25 integrity constraints, three scalar UDFs, and a stored procedure using nested cursors for report-style output.",
    tech: ["SQL Server", "T-SQL", "Stored Procedures"],
    bullets: [
      "Designed a normalized 8-table schema with 25 integrity constraints (PK, FK, UNIQUE, CHECK), composite key on OrderDetails, and self-referential employee hierarchy via ReportsTo.",
      "Engineered three scalar UDFs returning MONEY/INT with NULLIF-safe division, aggregating SUM(UnitPrice × Qty × (1−Discount)) across joins for customer and global order averages.",
      "Developed a stored procedure with nested CURSOR loops (outer: orders DESC by total, inner: line-item aggregation) and locale-aware FORMAT() output for report-style printing.",
      "Encoded business rules through constraints, UDFs, and stored procedure output so reports depend on relational guarantees rather than application-side cleanup.",
    ],
    github: repo("OrderManagementSystem"),
  },
  {
    title: "Patient Diagnosis Classifier",
    icon: Stethoscope,
    blurb: "C++17 binary decision tree with lambda predicates",
    description:
      "A medical decision tree classifier evaluating 9 diagnostic attributes via recursive lambda-predicate traversal across 1,000+ patient records.",
    tech: ["C++17", "Templates", "STL"],
    bullets: [
      "Engineered a 14-node binary decision tree evaluating 9 medical attributes (clump thickness, cell uniformity, bare nuclei, etc.) classifying samples as benign or malignant via recursive lambda traversal.",
      "Implemented a BinaryDecisionTree<T> template class supporting const/non-const lambda logic functions, enabling type-safe branch predicates without virtual function overhead.",
      "Built a CSV parsing pipeline with missing-value handling (\"?\" → 0), 1–10 range validation, and summary statistics output for total/benign/malignant/invalid counts.",
      "Kept classification transparent by making every branch predicate explicit, giving reviewers a readable path from attributes to diagnosis.",
    ],
    github: repo("Patient-Diagnosis"),
  },
  {
    title: "Groceries Mobile App",
    icon: ShoppingCart,
    blurb: "React Native + Firebase — deployed Android APK",
    description:
      "A cross-platform mobile grocery list app deployed as an installable Android APK, integrating Firebase Firestore for cloud document storage.",
    tech: ["React Native", "Expo", "Firebase", "Firestore"],
    bullets: [
      "Developed a cross-platform mobile app (React Native 0.83 + Expo 55) deployed as an installable 169 MB Android .apk; integrated Firebase Firestore with async/await error handling on all 5 CRUD operations.",
      "Implemented client-side immutable sort ([...list].sort()) on the Firestore document list by price, using optional chaining (?.list) for safe null access on empty documents.",
      "Designed a SafeAreaView layout with Flexbox primitives and Expo status bar management for consistent rendering across notched Android and iOS devices.",
      "Packaged the project as a real APK artifact, proving the Firestore-backed flow works beyond simulator-only development.",
    ],
    github: repo("Programming"),
  },
  {
    title: "Newcomb-Benford Data Analyzer",
    icon: ChartColumnIncreasing,
    blurb: "C++ dataset statistics CLI with Benford analysis",
    description:
      "A C++ command-line analyzer that reads numeric datasets from stdin or files, validates input, calculates descriptive statistics, and compares leading-digit distributions against Newcomb-Benford expectations.",
    tech: ["C++17", "STL", "Statistics", "CLI"],
    bullets: [
      "Computes mean, median, variance, standard deviation, min/max range, modes, and frequency tables from whitespace-separated numeric datasets.",
      "Implements Newcomb-Benford leading-digit analysis with expected-vs-actual percentages, ASCII bar output, specialized variance, and relationship-strength classification.",
      "Supports file input, interactive input, --help, and --skipbad handling for invalid/NaN/INF/non-positive values without silently corrupting the analysis.",
      "Keeps the statistical pipeline honest by isolating validation modes from analysis output, so skipped records are intentional rather than hidden.",
    ],
    github: repo("nbstats"),
  },
  {
    title: "Document Factory",
    icon: FileText,
    blurb: "C# document generator using factory and builder patterns",
    description:
      "A class-library project that generates HTML and Markdown documents from script-driven instructions through shared document and element abstractions.",
    tech: ["C#", ".NET", "Design Patterns", "OOP"],
    bullets: [
      "Implements factory- and builder-style abstractions so multiple document formats can be created from the same instruction script.",
      "Supports reusable document elements like headers, images, tables, and lists instead of hardcoding output strings.",
      "Shows design-pattern fluency in a library-oriented context rather than a UI-heavy one.",
      "Separates document construction from output format, letting the same scripted content produce HTML or Markdown without duplicated assembly logic.",
    ],
    github: repo("DocumentFactory"),
  },
  {
    title: "Canadian Cities Analyzer",
    icon: Building2,
    blurb: "C# data-processing app across CSV, JSON, and XML",
    description:
      "A data-processing utility that reads city data from multiple serialization formats and computes population-driven statistics from a shared model.",
    tech: ["C#", ".NET", "CSV", "JSON", "XML"],
    bullets: [
      "Reads the same domain data through CSV, JSON, and XML pipelines instead of binding the program to one import format.",
      "Separates data modeling and statistical calculation into distinct code paths instead of mixing parsing with reporting.",
      "Works well as a practical data-processing project outside the usual web-app frame.",
      "Normalizes city records after import so statistics stay format-agnostic across CSV, JSON, and XML sources.",
    ],
    github: repo("Programming"),
  },
  {
    title: "Global Economics Reporter",
    icon: Landmark,
    blurb: "XPath-based economic reporting tool",
    description:
      "A C# reporting application that loads XML economic datasets, filters them by region or year, and persists user preferences for repeated analysis.",
    tech: ["C#", ".NET", "XML", "XPath"],
    bullets: [
      "Queries structured XML with XPath to surface metrics like inflation, unemployment, and broader macroeconomic indicators.",
      "Stores user-selected year ranges so the application behaves more like a reusable reporting tool than a one-off parser.",
      "Adds another data-oriented desktop-style project with a different flavor from the SQL work.",
      "Combines persisted year filters with XPath queries so repeated reports can reuse user context instead of restarting from raw XML each run.",
    ],
    github: repo("GlobalEconomics"),
  },
  {
    title: "Stack Evaluator",
    icon: Layers,
    blurb: "C# stacking simulator built around Strategy and Flyweight",
    description:
      "A pattern-focused C# project that models heavy-object stacking rules through interchangeable strategies, flyweight reuse, and custom iteration.",
    tech: ["C#", ".NET", "Design Patterns", "OOP"],
    bullets: [
      "Defines multiple stacking strategies that can be swapped without changing the heavy-object model itself.",
      "Uses a flyweight factory to cache and reuse strategy instances rather than constructing them repeatedly.",
      "Rounds out the design-pattern work with iterator-based collection traversal on top of the strategy logic.",
      "Keeps stacking rules open for extension by adding strategies through new policy classes rather than branching through the object model.",
    ],
    github: repo("Programming"),
  },
  {
    title: "Triage Priority Queue",
    icon: FileText,
    blurb: "C++ triage simulation around a custom priority queue",
    description:
      "A C++ project centered on triage ordering, patient severity, and a custom queue implementation backed by targeted tests for the underlying types.",
    tech: ["C++", "STL", "Data Structures"],
    bullets: [
      "Builds the project around a custom priority queue rather than treating the queue as a black-box library detail.",
      "Models patients and ailments as domain entities so the data structure is exercised in a meaningful use case.",
      "Includes focused tests for the queue and its supporting classes.",
      "Uses the triage domain to exercise ordering behavior under realistic severity comparisons instead of abstract queue-only examples.",
    ],
    github: repo("Triage"),
  },
  {
    title: "Data Warehouse ETL Pipeline",
    icon: Database,
    blurb: "SQL ETL workflow for warehouse-style loading",
    description:
      "A dedicated SQL ETL script focused on extract-transform-load flow and warehouse thinking instead of only transactional application data.",
    tech: ["SQL Server", "T-SQL", "ETL"],
    bullets: [
      "Frames the work around ETL stages instead of just schema definition and seeded records.",
      "Shows data-engineering awareness by separating transformation logic from source-side structure.",
      "Adds a warehouse-oriented project to complement the OLTP-style database systems in the portfolio.",
      "Keeps source loading and transformations distinct, making the script easier to reason about as a repeatable warehouse workflow.",
    ],
    github: repo("DataWarehouseETLPipeline"),
  },
  {
    title: "Drone Management System",
    icon: Plane,
    blurb: "Operational SQL schema for drones, flights, and maintenance",
    description:
      "A relational SQL project modeling drone operations with flight tracking and maintenance concerns in a compact operational domain.",
    tech: ["SQL Server", "T-SQL"],
    bullets: [
      "Defines a domain model around flights and maintenance rather than repeating a generic storefront schema.",
      "Includes structure and sample data so the database is demonstrable out of the box.",
      "Useful as a clean relational-modeling example in a logistics-focused scenario.",
      "Captures operational relationships between drones, flights, and maintenance so the schema reads like a logistics system rather than a table exercise.",
    ],
    github: repo("DroneManagementSystem"),
  },
  {
    title: "Employee Management System",
    icon: Users,
    blurb: "HR and payroll database design",
    description:
      "A staff-management database project covering employees, departments, payroll, and organizational structure in a recognizable HR domain.",
    tech: ["PostgreSQL", "PLpgSQL", "SQL"],
    bullets: [
      "Models employee records, departments, and payroll relationships in a domain most reviewers can understand immediately.",
      "Broadens the SQL portfolio beyond order processing and warehouse-style examples.",
      "Useful as a backend/data project even without a web frontend attached to it.",
      "Uses PL/pgSQL-flavored schema work to show portability beyond SQL Server while staying grounded in HR/payroll relationships.",
    ],
    github: repo("EmployeeManagementSystem"),
  },
  {
    title: "Bookshelf Mobile App",
    icon: BookOpen,
    blurb: "React Native bookshelf with local SQLite persistence",
    description:
      "A mobile bookshelf app built with Expo and SQLite, with media-picker support for cover images and navigation across a local-first reading catalog.",
    tech: ["React Native", "Expo", "SQLite"],
    bullets: [
      "Centers the app on local SQLite persistence rather than making everything depend on a remote backend.",
      "Uses Expo media tooling to attach cover images and make the app feel more complete than a bare CRUD list.",
      "Complements the other mobile work with a different use case and persistence strategy.",
      "Keeps the reading catalog local-first, making add/edit flows responsive without requiring a network service for basic use.",
    ],
    github: repo("Programming"),
  },
  {
    title: "Course Grade Tracker",
    icon: GraduationCap,
    blurb: "C# grade calculator with JSON schema validation",
    description:
      "A practical course-tracking tool that validates stored JSON against a schema and computes weighted results across multiple evaluations.",
    tech: ["C#", ".NET", "JSON Schema", "Newtonsoft.Json"],
    bullets: [
      "Validates course and evaluation data against a schema instead of trusting arbitrary JSON input.",
      "Implements weighted grade calculations in a reusable model rather than hardcoding a single report path.",
      "Works well as a small but grounded utility project with an obvious real-world use case.",
      "Separates schema validation from calculation so corrupted course files fail early before weighted-grade logic runs.",
    ],
    github: repo("CourseGradeTracker"),
  },
  {
    title: "2D Parallax Arcade Game",
    icon: Gamepad2,
    blurb: "Unity gameplay prototype with scoring and scrolling backgrounds",
    description:
      "A Unity/C# game prototype featuring Rigidbody2D movement, enemy interactions, score tracking, and layered parallax backgrounds.",
    tech: ["Unity", "C#", "Game Development"],
    bullets: [
      "Implements player movement, collisions, scoring, and game-over behavior in a classic arcade-style loop.",
      "Uses scrolling parallax backgrounds to make a small prototype feel more polished and visually alive.",
      "Shows C# experience in a completely different context from business apps and data tools.",
      "Combines physics, collision outcomes, scoring, and background motion into a complete gameplay loop rather than a static movement demo.",
    ],
    github: repo("Programming"),
  },
  {
    title: "Customer Incentive Management System",
    icon: Users,
    blurb: "Java customer incentives with inheritance and overrides",
    description:
      "A Java OOP project centered on customer specialization, purchase-driven incentives, retail/preferred tiers, and cashback extensions exercised through a focused tester.",
    tech: ["Java", "OOP"],
    bullets: [
      "Uses inheritance across business, retail, and preferred customer categories instead of flattening all cases into one catch-all class.",
      "Overrides incentives() so preferred customers layer cashback behavior on top of retail purchase incentives.",
      "Separates domain classes from the test harness so the object model is still clear on its own.",
      "Uses a tester harness to exercise tier-specific incentive behavior so inheritance choices are visible through concrete purchase scenarios.",
    ],
    github: repo("Customerdatastorage"),
  },
  {
    title: "Family Genealogy Database",
    icon: TreePine,
    blurb: "SQL schema for family-history relationships",
    description:
      "A genealogy-focused SQL design that models family records and relationships in a less typical, more domain-specific database scenario.",
    tech: ["SQL Server", "T-SQL"],
    bullets: [
      "Applies relational thinking to ancestry and relationship data rather than another generic commerce domain.",
      "Adds variety to the database work by modeling a non-business, relationship-heavy problem space.",
      "Focuses on relationship cardinality and lookup paths that mirror family-history questions instead of simple CRUD fields.",
      "Works as a concise SQL modeling artifact for discussing entity design, relationship constraints, and domain-specific query needs.",
    ],
    github: repo("FamilyGenealogy"),
  },
  {
    title: "Fragrance E-Commerce",
    icon: Gem,
    blurb: "ASP.NET + Vue commerce platform with EF migrations",
    description:
      "A full-stack fragrance commerce project organized as an ASP.NET backend and a separate Vue + Quasar storefront, with EF Core migrations for customers, orders, branches, brands, and products.",
    tech: ["ASP.NET Core", "C#", "EF Core", "SQL Server", "Vue 3", "Quasar"],
    bullets: [
      "Separates backend and frontend concerns into distinct application areas, with 5 ASP.NET controllers and a Quasar SPA storefront.",
      "Tracks schema evolution through EF Core migrations covering customer, order, branch, brand, and product domain changes.",
      "Adds another commerce-focused full-stack build with a different product domain and structure from Fast Food Ordering.",
      "Uses the fragrance domain to demonstrate reusable commerce architecture without simply duplicating the fast-food ordering flow.",
    ],
    github: repo("FragranceEcommerce"),
  },
  {
    title: "Student Loan Repayment Calculator",
    icon: HandCoins,
    blurb: "Java loan-logic app with custom validation",
    description:
      "A Java application focused on student-loan calculations, domain modeling, and exception-driven validation for invalid numeric cases.",
    tech: ["Java", "OOP"],
    bullets: [
      "Includes a dedicated negative-value exception instead of relying only on generic runtime failures.",
      "Separates student data, payable logic, and the app entrypoint across focused Java classes.",
      "Works as a compact Java utility project with a clear domain problem and validation story.",
      "Surfaces a wide interest-rate option set and CSL/OSL outputs, giving the small Java app enough domain behavior to test validation and calculations.",
    ],
    github: repo("StudentLoanApp"),
  },
];

const projectInsights: Record<
  string,
  Pick<Project, "metrics" | "relations"> &
    Partial<Pick<Project, "stats">>
> = {
  "Debug My Heart": {
    metrics: [
      "14 authenticated React pages",
      "13 Express route modules",
      "6 MongoDB/Mongoose models",
      "6 Jest/Supertest suites + shared setup",
      "JWT + bcryptjs auth",
      "Stripe subscription checkout",
      "Multer-backed upload folder",
    ],
    relations: [
      "Full-Stack",
      "Frontend SPA",
      "Backend APIs",
      "External APIs",
      "Database",
      "MongoDB / NoSQL",
      "Authentication",
      "Payments",
      "Testing",
      "File Uploads",
      "Algorithms",
    ],
  },
  "Expression Evaluator": {
    metrics: [
      "April 2024 resume timeline",
      "Coursework/compiler pipeline context",
      "7,237 LOC",
      "41 C++ files",
      "5-stage tokenizer/parser/RPN/evaluator pipeline",
      "10+ token types",
      "shared_ptr + RAII memory handling",
      "Operator precedence + parenthesis handling",
      "Arbitrarily nested expression support",
      "Stack-based evaluation flow",
    ],
    stats: [
      {
        label: "Timeline",
        value: "April 2024",
        detail: "CareerForge resume source",
      },
      {
        label: "Scope",
        value: "7,237 LOC",
        detail: "Expression pipeline",
      },
      {
        label: "Codebase",
        value: "41 files",
        detail: "C++20 implementation",
      },
      {
        label: "Pipeline",
        value: "5 stages",
        detail: "Tokens to evaluator facade",
      },
      {
        label: "Types",
        value: "10+ tokens",
        detail: "Operand/operator hierarchy",
      },
      {
        label: "Memory",
        value: "RAII",
        detail: "shared_ptr, no manual ownership",
      },
    ],
    relations: [
      "Algorithms",
      "Custom Data Structures",
      "Parsing / Compilers",
    ],
  },
  "Employee Helpdesk Portal": {
    metrics: [
      "4-layer N-tier architecture",
      "5 controllers including reporting",
      "4 DAOs + generic IRepository<T>",
      "4 ViewModels",
      "2 xUnit test files",
      "2 generated PDF report outputs",
      "Optimistic concurrency status codes",
    ],
    relations: [
      "Full-Stack",
      "Backend APIs",
      "Database",
      "SQL / Relational DB",
      "Testing",
      "Reporting / PDF",
      "File Uploads",
      "Admin Dashboard",
    ],
  },
  "Wordle gRPC Microservices": {
    metrics: [
      "3-service architecture",
      "2 Protobuf service contracts",
      "Bidirectional streaming RPC",
      "6-guess game loop",
      "Daily seeded word selection",
      "Mutex-protected JSON stats persistence",
    ],
    relations: [
      "Backend APIs",
      "Real-Time",
      "gRPC / Microservices",
      "Algorithms",
      "Local Storage",
    ],
  },
  "Fast Food Ordering": {
    metrics: [
      "6 ASP.NET controllers",
      "5 EF Core relational tables",
      "3 EF Core migrations + model snapshot",
      "15 Quasar/Vue pages",
      "JWT + PBKDF2/RFC2898 password hashing",
      "Swagger/OpenAPI enabled",
      "Async tray transaction with rollback",
    ],
    relations: [
      "Full-Stack",
      "Frontend SPA",
      "Backend APIs",
      "Database",
      "SQL / Relational DB",
      "Authentication",
      "Admin Dashboard",
    ],
  },
  "Real-Time Room Chat App": {
    metrics: [
      "Socket.IO bidirectional room messaging",
      "/edit and /del slash commands",
      "Soft-delete + edit timestamps",
      "Multi-user typing indicators",
      "75-color user palette",
      "Server-side Room state class",
    ],
    relations: [
      "Full-Stack",
      "Frontend SPA",
      "Backend APIs",
      "Real-Time",
    ],
  },
  "Travel Advisory Tracker": {
    metrics: [
      "7 Express API endpoints",
      "Live government travel advisory API",
      "118 ISO 3166-1 countries joined",
      "3 MongoDB collections",
      "5 React UI components",
      "POST /db/refresh ETL endpoint",
    ],
    relations: [
      "Full-Stack",
      "Frontend SPA",
      "Backend APIs",
      "External APIs",
      "Database",
      "MongoDB / NoSQL",
      "Data Processing",
    ],
  },
  "Newcomb-Benford Data Analyzer": {
    metrics: [
      "Single-purpose C++ CLI",
      "File and interactive input modes",
      "7 descriptive statistics outputs",
      "9 leading-digit buckets",
      "--skipbad validation mode",
      "ASCII distribution report",
    ],
    relations: ["Data Processing", "Algorithms"],
  },
  "Khronos Calendar Library": {
    metrics: [
      "4,055 LOC",
      "42 files",
      "5 calendar implementations",
      "Julian Day Number interchange hub",
      "200+ validation cases",
      "Bidirectional date conversion functions",
    ],
    relations: ["Algorithms", "Testing", "Data Processing"],
  },
  "Stoichiometry Library": {
    metrics: [
      "1,353 LOC",
      "8-file library/CLI split",
      "118-element CSV periodic table",
      "5-rule validation pipeline",
      "Recursive descent formula parser",
      "/f filepath batch mode",
    ],
    relations: ["Data Processing", "Algorithms", "Parsing / Compilers"],
  },
  "Coffee Shop POS": {
    metrics: [
      "3 GoF patterns in one system",
      "4-state order lifecycle",
      "Bridge-based brewer abstraction",
      "Recursive Decorator composition",
      "10+ drink combinations",
    ],
    relations: ["Design Patterns"],
  },
  "Collaborative Drawing App": {
    metrics: [
      "Mediator command router",
      "Observer broadcast flow",
      "Memento undo/redo snapshots",
      "3 supported shape types",
      "ReferenceEquals sender exclusion",
    ],
    relations: ["Design Patterns", "Custom Data Structures"],
  },
  "Enigma Machine Simulator": {
    metrics: [
      "Java Swing desktop GUI",
      "MVC + Observer structure",
      "3-rotor cipher path",
      "52 positioned key/lamp elements",
      "O(1) rotor character translation",
      "Odometer-style rotor stepping",
    ],
    relations: ["Desktop GUI", "Algorithms", "Design Patterns"],
  },
  "Order Management System": {
    metrics: [
      "8 normalized SQL tables",
      "25 integrity constraints",
      "3 scalar UDFs",
      "Nested cursor stored procedure",
      "Composite OrderDetails key",
      "Self-referential employee hierarchy",
    ],
    relations: [
      "Database",
      "SQL / Relational DB",
      "SQL Procedures",
      "Data Processing",
    ],
  },
  "Patient Diagnosis Classifier": {
    metrics: [
      "14-node binary decision tree",
      "9 diagnostic attributes",
      "1,000+ patient records",
      "Template-based BinaryDecisionTree<T>",
      "CSV parser with missing-value handling",
    ],
    relations: [
      "Data Processing",
      "Algorithms",
      "Custom Data Structures",
    ],
  },
  "Groceries Mobile App": {
    metrics: [
      "React Native 0.83 + Expo 55",
      "Installable Android APK",
      "Firebase Firestore persistence",
      "5 CRUD operations",
      "SafeAreaView/Flexbox mobile layout",
      "Client-side immutable sorting",
    ],
    relations: [
      "Mobile",
      "External APIs",
      "Database",
      "MongoDB / NoSQL",
      "Cloud / Deployment",
    ],
  },
  "Document Factory": {
    metrics: [
      "2 output formats: HTML + Markdown",
      "Factory abstractions for each document type",
      "Reusable headers/images/tables/lists",
      "Script-driven Director console app",
      "Generated demo docs included",
    ],
    relations: ["Design Patterns", "Document Generation"],
  },
  "Canadian Cities Analyzer": {
    metrics: [
      "CSV, JSON, and XML import paths",
      "Shared city domain model",
      "Population statistics engine",
      "Bundled Canadian city datasets",
    ],
    relations: ["Data Processing"],
  },
  "Global Economics Reporter": {
    metrics: [
      "XPath economic queries",
      "XML dataset loading",
      "User year-range persistence",
      "Inflation/unemployment reporting focus",
    ],
    relations: ["Data Processing"],
  },
  "Stack Evaluator": {
    metrics: [
      "Strategy pattern stacking rules",
      "Flyweight strategy reuse",
      "Custom aggregate + iterator",
      "4 stacking strategies",
    ],
    relations: [
      "Design Patterns",
      "Algorithms",
      "Custom Data Structures",
    ],
  },
  "Triage Priority Queue": {
    metrics: [
      "Custom priority queue implementation",
      "Domain model for patients and ailments",
      "Google Test project present",
      "Severity-based triage ordering",
    ],
    relations: [
      "Algorithms",
      "Custom Data Structures",
      "Testing",
    ],
  },
  "Data Warehouse ETL Pipeline": {
    metrics: [
      "Dedicated ETL workflow",
      "Warehouse-style loading",
      "T-SQL transformation scripts",
      "Source/transform separation",
    ],
    relations: [
      "Database",
      "SQL / Relational DB",
      "SQL Procedures",
      "Data Processing",
    ],
  },
  "Drone Management System": {
    metrics: [
      "SQL Server/T-SQL schema",
      "Drone operations domain",
      "Flight and maintenance modeling",
      "Seed data included",
    ],
    relations: ["Database", "SQL / Relational DB"],
  },
  "Employee Management System": {
    metrics: [
      "PostgreSQL/PLpgSQL schema",
      "HR/payroll domain model",
      "Department and employee relationships",
      "Public standalone repo",
    ],
    relations: [
      "Database",
      "SQL / Relational DB",
      "SQL Procedures",
    ],
  },
  "Bookshelf Mobile App": {
    metrics: [
      "React Native + Expo mobile app",
      "SQLite local persistence",
      "Media picker cover images",
      "Navigation-based reading catalog",
    ],
    relations: [
      "Mobile",
      "Database",
      "SQL / Relational DB",
      "Local Storage",
    ],
  },
  "Course Grade Tracker": {
    metrics: [
      "JSON Schema validation",
      "Weighted grade calculations",
      "Course/evaluation model split",
      "Newtonsoft.Json pipeline",
    ],
    relations: ["Data Processing", "Algorithms"],
  },
  "2D Parallax Arcade Game": {
    metrics: [
      "Unity/C# gameplay prototype",
      "Rigidbody2D movement",
      "Collision-driven enemy interactions",
      "Score and game-over loop",
      "Layered parallax backgrounds",
    ],
    relations: ["Game Development", "Algorithms"],
  },
  "Customer Incentive Management System": {
    metrics: [
      "5 Java source classes",
      "Business/Retail/Preferred customer hierarchy",
      "Overridden incentives() calculation",
      "Cashback-rate extension",
      "Dedicated tester harness",
    ],
    relations: ["Algorithms"],
  },
  "Family Genealogy Database": {
    metrics: [
      "SQL Server/T-SQL schema",
      "Family-history relationship domain",
      "Non-commerce relational modeling",
    ],
    relations: ["Database", "SQL / Relational DB"],
  },
  "Fragrance E-Commerce": {
    metrics: [
      "5 ASP.NET controllers",
      "9 EF Core migrations + model snapshot",
      "9 Quasar/Vue pages",
      "Customers/orders/branches/brands/products domain",
      "Split frontend/backend repo structure",
    ],
    relations: [
      "Full-Stack",
      "Frontend SPA",
      "Backend APIs",
      "Database",
      "SQL / Relational DB",
    ],
  },
  "Student Loan Repayment Calculator": {
    metrics: [
      "Java Swing desktop UI",
      "13 input fields",
      "41 interest-rate options from 0-10%",
      "CSL + OSL payment outputs",
      "Previous/next student navigation",
      "Custom negative-value exception",
    ],
    relations: ["Desktop GUI", "Algorithms"],
  },
};

export const projects: Project[] = rawProjects.map((project) => {
  const insight = projectInsights[project.title];

  return {
    ...project,
    metrics: insight?.metrics ?? [],
    stats: insight?.stats ?? [],
    relations: insight?.relations ?? [],
  };
});
