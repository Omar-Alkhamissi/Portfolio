export type Project = {
  title: string;
  blurb: string;
  description: string;
  tech: string[];
  bullets: string[];
  github: string;
  liveDemo?: string;
};

const GH = "https://github.com/Omar-Alkhamissi";

export const projects: Project[] = [
  {
    title: "Debug My Heart",
    blurb: "MERN dating platform — Database Lead, team of 5",
    description:
      "A 5,921-LOC MERN dating app with weighted compatibility matching, JWT auth, Stripe-gated subscriptions, and a 6-suite Jest test harness — built as Database Lead in a team of 5.",
    tech: ["React 18", "Node.js", "Express", "MongoDB", "Stripe", "JWT", "Jest"],
    bullets: [
      "Engineered a 5-factor weighted compatibility algorithm scoring users on skills, tech stack, interests, location, and intent into a normalized 0–100% match across 14 authenticated pages and 6 MongoDB models.",
      "Implemented JWT auth with bcryptjs (salt=10), middleware-based role checks, and React Context token persistence; protected routes via compound DB indexes for sub-100ms mutual-match lookups.",
      "Integrated Stripe Subscription API ($5/month) with idempotent checkout sessions and metadata linking, gating contact info behind verified payment status; built a 6-suite Jest + Supertest harness using mongodb-memory-server for isolated integration tests.",
    ],
    github: `${GH}`,
  },
  {
    title: "Expression Evaluator (ee24Complete)",
    blurb: "5-stage C++20 tokenizer → parser → RPN evaluator",
    description:
      "A modular expression evaluation pipeline (7,237 LOC, 41 files) separating tokenization, parsing, RPN conversion, and evaluation into independent C++20 components with a clean facade.",
    tech: ["C++20", "STL", "shared_ptr", "RAII"],
    bullets: [
      "Architected a 5-stage pipeline (tokens → tokenizer → parser → RPN → evaluator) with each stage as an independent, reusable component across 41 files and 7,237 lines of C++20.",
      "Designed a type-safe token hierarchy (Token base → Operand/Operator subclasses) with shared_ptr RAII, supporting 10+ token types without runtime casting or manual memory management.",
      "Implemented Reverse Polish Notation conversion with operator precedence and parenthesis resolution, enabling correct evaluation of arbitrarily nested expressions behind a single evaluate(string) facade call.",
    ],
    github: `${GH}`,
  },
  {
    title: "Employee Helpdesk Portal",
    blurb: "N-tier ASP.NET Core helpdesk with CI/CD",
    description:
      "A 4-layer N-tier helpdesk (Controllers → ViewModels → DAOs → IRepository<T>) with optimistic concurrency detection and a GitHub Actions build/test pipeline.",
    tech: ["ASP.NET Core", "EF Core", "SQL Server", "xUnit", "GitHub Actions"],
    bullets: [
      "Designed a 4-layer N-tier architecture across 28 files with clean layer isolation and a generic IRepository<T> interface eliminating CRUD duplication across 4 entity types.",
      "Implemented optimistic concurrency detection using UpdateStatus return codes (-2 = stale data) preventing silent overwrites without pessimistic table locks.",
      "Configured a GitHub Actions CI/CD pipeline automating build and xUnit test execution on every push, with QoDo static analysis integration for code quality enforcement.",
    ],
    github: `${GH}`,
  },
  {
    title: "Wordle gRPC Microservices",
    blurb: "3-tier .NET 9 gRPC system with bidirectional streaming",
    description:
      "A 3-service Wordle implementation: WordServer provides daily seeded words, WordleGameServer manages a 6-guess loop, and a dual-threaded console client renders ANSI-color feedback over gRPC streams.",
    tech: ["C# .NET 9", "gRPC", "Protobuf", "HTTP/2", "Mutex"],
    bullets: [
      "Architected a 3-tier gRPC microservice system (.NET 9) with bidirectional streaming RPCs and a deterministic daily word seeded by Random(YYYYMMDD).",
      "Implemented a two-pass Wordle evaluation algorithm — first marks exact positions and builds a frequency map, second checks wrong-position letters against remaining frequency — correctly handling duplicate letters without over-marking.",
      "Designed thread-safe stats persistence using a named System.Threading.Mutex protecting game_stats.json from concurrent writes across simultaneous multi-player completions.",
    ],
    github: `${GH}`,
  },
  {
    title: "Fast Food Ordering",
    blurb: "ASP.NET 8 + Vue 3 ordering platform",
    description:
      "A full-stack ordering platform with EF Core code-first migrations, RFC2898 password hashing, JWT auth, and a Vue 3 + Quasar frontend served via async DB transactions.",
    tech: ["ASP.NET Core 8", "Vue 3", "EF Core", "JWT", "Swagger", "Quasar"],
    bullets: [
      "Architected an EF Core Code-First model with 5 relational tables, FK constraints, and SQL Server LocalDB; generated migrations tracking schema evolution across iterations.",
      "Implemented RFC2898DeriveBytes password hashing (10,000 iterations, 64-byte salt) and JWT generation with symmetric HMAC-SHA256 signing, configurable via appsettings.json.",
      "Designed an async transaction (BeginTransactionAsync → CommitAsync → RollbackAsync) atomically creating a Tray, inserting line items, and computing 9 nutrition totals in one rollback-safe operation.",
    ],
    github: `${GH}`,
  },
  {
    title: "Real-Time Chat App",
    blurb: "Socket.IO chat with /edit, /del, typing indicators",
    description:
      "A real-time chat platform with Socket.IO bidirectional pub/sub, slash-command message editing, multi-user typing indicators, and per-user color allocation across rooms.",
    tech: ["Node.js", "Express", "Socket.IO", "React 19", "MUI 7"],
    bullets: [
      "Architected real-time messaging using Socket.IO 4.8 with room-based isolation, per-user color assignment from a 75-entry palette with Set-based deduplication, and automatic color release on disconnect.",
      "Engineered a message mutation system with /edit and /del slash-commands, soft-delete flags (deletedAt), edit timestamps, and conditional rendering for mutation metadata.",
      "Built a server-side Room class managing message log, typing user set, and member list — handling edge cases like multi-user typing pluralization (\"X and Y are typing...\") and day-boundary separators via date-fns.",
    ],
    github: `${GH}`,
  },
  {
    title: "Travel Advisory Aggregator",
    blurb: "Government API ETL with MongoDB & React",
    description:
      "A full-stack travel advisory tracker that ingests live government data, joins ISO 3166-1 country metadata, and surfaces it through a React + MUI bookmarkable UI.",
    tech: ["Node.js", "Express", "MongoDB", "React 19", "MUI"],
    bullets: [
      "Engineered a data ingestion pipeline consuming a live government travel advisory API, normalizing timestamps, left-joining 118 ISO 3166-1 countries, and upserting merged records into 3 MongoDB collections.",
      "Built a repository abstraction layer (db.js) with parameterized queries and projection optimization — advisory text excluded from list views, included in detail views — to reduce payload size.",
      "Designed a POST /db/refresh endpoint triggering full database drop/recreate for daily synchronization, with NULLIF-safe aggregations and optional chaining preventing null reference errors on empty data.",
    ],
    github: `${GH}`,
  },
  {
    title: "Khronos Multi-Calendar Library",
    blurb: "C++17 cross-calendar dates via Julian Day hub",
    description:
      "A C++17 library converting between Gregorian, Julian, Hebrew, and Islamic calendars (4,055 LOC, 42 files) using Julian Day Number as a universal interchange hub.",
    tech: ["C++17", "STL"],
    bullets: [
      "Designed a multi-calendar system with 5 calendar implementations using Julian Day Number as the universal interchange hub, enabling O(1) cross-calendar conversion without N×N direct converters.",
      "Implemented bidirectional conversion functions (gregorian_to_jd, jd_to_gregorian, hebrew_to_jd, etc.) incorporating astronomical algorithms for historical and religious calendar systems.",
      "Developed a 200+ test case suite validating round-trip conversions (Gregorian → JD → Gregorian), leap year edge cases, and religious calendar boundary conditions.",
    ],
    github: `${GH}`,
  },
  {
    title: "Stoichiometry Library",
    blurb: ".NET 9 chemical formula parser & periodic table",
    description:
      "A library + CLI parsing chemical formulas with multi-pass recursive descent, lazy-loaded periodic table from CSV, and a 5-rule validation pipeline (1,353 LOC, 8 files).",
    tech: ["C# .NET 9", "CsvHelper", "Recursive Parsing"],
    bullets: [
      "Built a multi-pass recursive descent tokenizer handling two-char element symbols, multi-digit subscripts, parenthetical groups with scalar multipliers, and duplicate element aggregation.",
      "Implemented a 5-rule validation pipeline (null safety → symbol lookup → parenthesis matching → nesting rejection → subscript positioning) with descriptive errors per rule failure.",
      "Integrated CsvHelper 33.1 with attribute-driven field mapping to lazy-load 118 elements, cached via a double-check singleton, and shipped a library/CLI split with /f:filepath batch processing.",
    ],
    github: `${GH}`,
  },
  {
    title: "Coffee Shop POS",
    blurb: ".NET 8 POS — State + Bridge + Decorator patterns",
    description:
      "A point-of-sale showcase implementing three Gang-of-Four patterns in one cohesive system: State for order lifecycle, Bridge for brewing, Decorator for customization.",
    tech: ["C# .NET 8", "Design Patterns", "OOP"],
    bullets: [
      "Implemented a 4-state POS state machine (TakingOrder → Preparing → Payment → Pickup) using IOrderState polymorphic objects encapsulating transitions inside a CoffeeShop context class.",
      "Applied the Bridge pattern decoupling Drink abstraction from IBrewer implementations (AutomaticMachine, ManualSteamer), enabling runtime brew selection without modifying drink classes.",
      "Designed a recursive Decorator hierarchy stacking Cost() and Description() aggregation across MilkDecorator, SyrupDecorator, and WhipDecorator to support 10+ drink combinations.",
    ],
    github: `${GH}/CoffeeShopPOS`,
  },
  {
    title: "Collaborative Drawing App",
    blurb: ".NET 8 multi-user canvas — Mediator + Observer + Memento",
    description:
      "A multi-user drawing system implementing Mediator (command routing), Observer (broadcast updates), and Memento (full undo/redo with shape snapshots).",
    tech: ["C# .NET 8", "Design Patterns", "OOP"],
    bullets: [
      "Architected a Mediator (DrawingMediator, 190 LOC) coordinating multi-user sessions, parsing 3 shape types with coordinate validation and routing state updates without direct user coupling.",
      "Implemented Observer with sender-exclusion logic (ReferenceEquals) ensuring shape additions broadcast to all observers except the originating user.",
      "Designed a Memento-based undo/redo system (CanvasCaretaker + CanvasMemento) maintaining immutable snapshots with CanUndo/CanRedo guards and informative diff messages identifying the reverted shape.",
    ],
    github: `${GH}`,
  },
  {
    title: "Enigma Machine Simulator",
    blurb: "Java Swing simulator of the WWII rotor cipher",
    description:
      "A historically accurate Enigma machine simulator with MVC architecture, 3-rotor signal propagation, and an interactive GUI with 52 positioned key/lamp elements.",
    tech: ["Java", "Swing", "MVC", "Observer"],
    bullets: [
      "Implemented 3-rotor signal propagation with forwardMap/backwardMap permutation arrays and O(1) character translation via modulo arithmetic ((idx + offset) % 26).",
      "Engineered odometer-style rotor stepping with automatic carry propagation (fast → medium → slow) and bidirectional signal flow (keyboard → rotors → reflector → rotors → lamp).",
      "Rendered an interactive GUI with 52 dynamically positioned elements, real-time key/lamp color feedback, ImageIO-loaded background assets, and Observer pattern for decoupled view updates.",
    ],
    github: `${GH}`,
  },
  {
    title: "Order Management Database",
    blurb: "T-SQL system with nested cursors & UDFs",
    description:
      "A full T-SQL relational system with 8 tables, 25 integrity constraints, three scalar UDFs, and a stored procedure using nested cursors for report-style output.",
    tech: ["SQL Server", "T-SQL", "Stored Procedures"],
    bullets: [
      "Designed a normalized 8-table schema with 25 integrity constraints (PK, FK, UNIQUE, CHECK), composite key on OrderDetails, and self-referential employee hierarchy via ReportsTo.",
      "Engineered three scalar UDFs returning MONEY/INT with NULLIF-safe division, aggregating SUM(UnitPrice × Qty × (1−Discount)) across joins for customer and global order averages.",
      "Developed a stored procedure with nested CURSOR loops (outer: orders DESC by total, inner: line-item aggregation) and locale-aware FORMAT() output for report-style printing.",
    ],
    github: `${GH}`,
  },
  {
    title: "Patient Diagnosis Classifier",
    blurb: "C++17 binary decision tree with lambda predicates",
    description:
      "A medical decision tree classifier evaluating 9 diagnostic attributes via recursive lambda-predicate traversal across 1,000+ patient records.",
    tech: ["C++17", "Templates", "STL"],
    bullets: [
      "Engineered a 14-node binary decision tree evaluating 9 medical attributes (clump thickness, cell uniformity, bare nuclei, etc.) classifying samples as benign or malignant via recursive lambda traversal.",
      "Implemented a BinaryDecisionTree<T> template class supporting const/non-const lambda logic functions, enabling type-safe branch predicates without virtual function overhead.",
      "Built a CSV parsing pipeline with missing-value handling (\"?\" → 0), 1–10 range validation, and summary statistics output for total/benign/malignant/invalid counts.",
    ],
    github: `${GH}/Patient-Diagnosis`,
  },
  {
    title: "Groceries Mobile App",
    blurb: "React Native + Firebase — deployed Android APK",
    description:
      "A cross-platform mobile grocery list app deployed as an installable Android APK, integrating Firebase Firestore for cloud document storage.",
    tech: ["React Native", "Expo", "Firebase", "Firestore"],
    bullets: [
      "Developed a cross-platform mobile app (React Native 0.83 + Expo 55) deployed as an installable 169 MB Android .apk; integrated Firebase Firestore with async/await error handling on all 5 CRUD operations.",
      "Implemented client-side immutable sort ([...list].sort()) on the Firestore document list by price, using optional chaining (?.list) for safe null access on empty documents.",
      "Designed a SafeAreaView layout with Flexbox primitives and Expo status bar management for consistent rendering across notched Android and iOS devices.",
    ],
    github: `${GH}`,
  },
];
