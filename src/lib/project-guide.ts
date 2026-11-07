// src/lib/project-guide.ts
// Comprehensive curriculum intelligence and technical project guides for 42 Network and general software engineering.
// Features 50 verified 42 projects across:
// - Traditional Common Core (v1, C/C++ foundation, Ranks 0–6)
// - New 2026 Common Core (v2 / 42Next: Python, AI, Constrained Decoding, RAG, Codexion, A-Maze-ing, Fly-In)
// - Outer Circle Specializations (Cybersecurity, Low-Level Systems, AI/Data Science, 3D Graphics, Web/Mobile)
// - Piscine & Gateway Bootcamps
// Plus dynamic archetype question templates for Personal, Freelance, Hackathon, and Open-Source projects.

export interface GuideQuestion {
  id: string;
  type: "checkbox" | "radio" | "text";
  question: string;
  options?: string[];
  placeholder?: string;
}

export type CurriculumCategory =
  | "common-core-v1" // Traditional 42 Common Core (C/C++ focus, Ranks 0–6)
  | "common-core-v2" // 42Next / 2026 Common Core (Python, AI, Constrained Decoding, RAG)
  | "outer-circle"   // Specialization projects (Post-Core)
  | "piscine";       // Gateway Piscine bootcamps

export type EngineeringTrack =
  | "General"
  | "Unix & Systems"
  | "Graphics"
  | "Algorithms"
  | "Web & Mobile"
  | "Cybersecurity"
  | "AI & Data Science"
  | "DevOps & Cloud";

export type ProjectVerificationStatus =
  | "verified-subject"     // Official 42 subject requirements and constraints verified
  | "curriculum-catalog"  // Verified from 42 cursus syllabus / intra milestones
  | "community-verified"; // Confirmed across multiple campus implementations

export interface ProjectGuide {
  slug: string;
  aliases: string[];
  name: string;
  // One plain factual sentence: what the project is.
  about: string;
  // Tools universally mandated by the project subject. Empty string if selected by student / team.
  techStack: string;
  category: CurriculumCategory;
  track: EngineeringTrack;
  verificationStatus: ProjectVerificationStatus;
  questions: GuideQuestion[];
}

// ---------------------------------------------------------------------------
// 1. TRADITIONAL COMMON CORE GUIDES (v1: C / C++ Focus, Ranks 0 through 6)
// ---------------------------------------------------------------------------
export const COMMON_CORE_V1_GUIDES: ProjectGuide[] = [
  {
    slug: "libft",
    aliases: [],
    name: "Libft",
    about: "A C library rewritten from scratch: string, memory, and list manipulation functions from libc, reused in all subsequent 42 projects.",
    techStack: "C, Make",
    category: "common-core-v1",
    track: "Unix & Systems",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "libft-functions",
        type: "checkbox",
        question: "Which parts of libc did you re-engineer?",
        options: [
          "Memory functions (memset, bzero, memcpy, memmove, memchr, memcmp, calloc)",
          "String functions (strlen, strchr, strrchr, strncmp, strnstr, strdup)",
          "Type conversion and checks (isalpha, isdigit, isalnum, isascii, isprint, toupper, tolower, atoi)",
          "Additional utility functions (substr, strjoin, strtrim, split, itoa, strmapi, striteri)",
          "File descriptor outputs (putchar_fd, putstr_fd, putendl_fd, putnbr_fd)",
        ],
      },
      { id: "libft-bonus", type: "radio", question: "Did you implement the bonus linked list data structures?", options: ["Yes", "No"] },
      { id: "libft-extra", type: "text", question: "Did you add your own utility functions to it later?", placeholder: "e.g., added get_next_line, ft_printf, and safe memory wrappers for future projects" },
    ],
  },
  {
    slug: "ft_printf",
    aliases: ["printf"],
    name: "ft_printf",
    about: "A rewrite of the C printf function that handles variadic arguments and format conversions.",
    techStack: "C, Make",
    category: "common-core-v1",
    track: "Unix & Systems",
    verificationStatus: "verified-subject",
    questions: [
      { id: "printf-specifiers", type: "checkbox", question: "Which conversions did you support?", options: ["%c", "%s", "%p", "%d / %i", "%u", "%x / %X", "%%"] },
      { id: "printf-bonus", type: "radio", question: "Did you implement the bonus format flags (width, precision, #, +, space)?", options: ["Yes", "No"] },
      { id: "printf-arch", type: "text", question: "How did you manage variadic arguments and buffer output?", placeholder: "e.g., used va_list and va_arg with a custom dispatcher table" },
    ],
  },
  {
    slug: "get_next_line",
    aliases: ["gnl"],
    name: "get_next_line",
    about: "A C function that reads an arbitrary file descriptor line-by-line using a persistent static buffer.",
    techStack: "C, I/O Buffering",
    category: "common-core-v1",
    track: "Unix & Systems",
    verificationStatus: "verified-subject",
    questions: [
      { id: "gnl-bonus", type: "radio", question: "Can it read from multiple file descriptors concurrently without losing read offsets (bonus)?", options: ["Yes", "No"] },
      { id: "gnl-tests", type: "text", question: "How did you stress-test buffer boundaries and leak resistance?", placeholder: "e.g., tested with BUFFER_SIZE from 1 to 10,000,000 on standard input, binary files, and verified 0 leaks with Valgrind" },
    ],
  },
  {
    slug: "born2beroot",
    aliases: ["b2br"],
    name: "Born2beRoot",
    about: "Setting up a secure virtualized Linux server with LVM disk encryption, firewall rules, and automated system monitoring.",
    techStack: "Linux, SSH, UFW, LVM, Bash",
    category: "common-core-v1",
    track: "DevOps & Cloud",
    verificationStatus: "verified-subject",
    questions: [
      { id: "b2br-os", type: "radio", question: "Which Linux distribution did you deploy?", options: ["Debian", "Rocky Linux"] },
      {
        id: "b2br-security",
        type: "checkbox",
        question: "What security and administration policies did you implement?",
        options: [
          "Encrypted root partition with LVM",
          "UFW firewall with strict port forwarding and custom SSH port",
          "Strong password expiration and complexity policies (PAM pwquality)",
          "Strict sudo rules with audit logs in /var/log/sudo/",
          "Automated cron bash monitoring script broadcasting system telemetry",
        ],
      },
      { id: "b2br-bonus", type: "checkbox", question: "Bonus services configured?", options: ["WordPress with Lighttpd and MariaDB", "Additional service of my choice"] },
    ],
  },
  {
    slug: "push_swap",
    aliases: [],
    name: "push_swap",
    about: "An algorithmic project sorting an arbitrary stack of integers using a secondary stack and a restricted set of stack operations in minimal moves.",
    techStack: "C, Algorithms, Data Structures",
    category: "common-core-v1",
    track: "Algorithms",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "ps-algorithm",
        type: "radio",
        question: "Which sorting algorithm did you engineer?",
        options: [
          "Turk algorithm (cheapest move cost calculation for each element)",
          "Radix sort using bitwise shift operations",
          "Chunk sorting using median indexing",
          "Custom hybrid optimization method",
        ],
      },
      { id: "ps-moves", type: "text", question: "About how many moves did your algorithm require for 100 and 500 numbers?", placeholder: "e.g., under 600 moves for 100 numbers and under 5,300 moves for 500 numbers" },
      { id: "ps-edge", type: "text", question: "Which edge cases did your parser handle?", placeholder: "e.g., integer overflow checks, duplicates detection, non-numeric inputs, and already sorted arrays" },
    ],
  },
  {
    slug: "pipex",
    aliases: [],
    name: "pipex",
    about: "A C program that reproduces the Unix shell pipeline mechanism, connecting process inputs and outputs with pipes and redirections.",
    techStack: "C, Unix processes, Pipes, IPC",
    category: "common-core-v1",
    track: "Unix & Systems",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "pipex-features",
        type: "checkbox",
        question: "Which IPC and process capabilities did you implement?",
        options: [
          "Forking child processes and pipeline chaining with pipe() and dup2()",
          "Environment PATH resolution and dynamic binary execution via execve()",
          "Graceful file descriptor leak prevention and child exit status propagation",
          "Multiple pipe support for arbitrary command chains (cmd1 | cmd2 | ... | cmdN)",
          "Here_doc (<<) delimiter input reading and append mode (>>)",
        ],
      },
      {
        id: "pipex-bonus",
        type: "checkbox",
        question: "Which bonus parts did you complete?",
        options: ["Multiple command pipelines", "here_doc (<<) and append mode (>>)"],
      },
    ],
  },
  {
    slug: "minitalk",
    aliases: [],
    name: "minitalk",
    about: "A client-server inter-process communication system in C transmitting text streams using only Unix SIGUSR1 and SIGUSR2 signals.",
    techStack: "C, Unix signals, Bitwise operations",
    category: "common-core-v1",
    track: "Unix & Systems",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "mt-protocol",
        type: "checkbox",
        question: "How did you design the communication protocol?",
        options: [
          "Bitwise serialization and reconstruction (8 signals per byte)",
          "Bidirectional signal acknowledgment handshake to prevent packet dropping",
          "Support for full UTF-8 Unicode characters and emojis",
          "Client PID tracking and queuing for concurrent transmissions",
        ],
      },
      { id: "mt-bonus", type: "checkbox", question: "Bonus features completed?", options: ["Server acknowledgment signal to client", "Unicode / UTF-8 character encoding support"] },
    ],
  },
  {
    slug: "so_long",
    aliases: [],
    name: "so_long",
    about: "A 2D top-down game in C using MiniLibX with flood-fill map validation, player animations, and tile-based rendering.",
    techStack: "C, MiniLibX, 2D Gaming",
    category: "common-core-v1",
    track: "Graphics",
    verificationStatus: "verified-subject",
    questions: [
      { id: "sl-check", type: "radio", question: "How did you validate that all collectibles and exits were reachable on the map?", options: ["Flood fill algorithm", "Breadth-First Search (BFS)", "Depth-First Search (DFS)"] },
      { id: "sl-bonus", type: "checkbox", question: "Bonus mechanics implemented?", options: ["Patrolling enemy sprites", "Animated sprite sheet cycles", "On-screen movement counter HUD", "Loss conditions and collision states"] },
    ],
  },
  {
    slug: "fdf",
    aliases: [],
    name: "FdF",
    about: "A 3D wireframe graphic visualizer in C rendering terrain heightmaps with isometric projection and color gradients using MiniLibX.",
    techStack: "C, MiniLibX, Computer Graphics",
    category: "common-core-v1",
    track: "Graphics",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "fdf-features",
        type: "checkbox",
        question: "What capabilities did you engineer?",
        options: [
          "Bresenham line rasterization algorithm",
          "Isometric and parallel projection coordinate transformations",
          "Interactive camera controls: rotation (X/Y/Z), pan, and zoom",
          "Dynamic altitude color gradients based on Z elevation",
          "File parsing for arbitrary 2D heightmap arrays",
        ],
      },
      { id: "fdf-rendering", type: "text", question: "How did you optimize rendering performance and line rasterization?", placeholder: "e.g., used direct memory pixel writing with mlx_get_data_addr to eliminate screen tearing and render 100k points at 60 FPS" },
    ],
  },
  {
    slug: "fract-ol",
    aliases: ["fractol"],
    name: "fract-ol",
    about: "An interactive mathematical fractal visualizer in C rendering Mandelbrot and Julia sets with smooth mouse zooming using MiniLibX.",
    techStack: "C, MiniLibX, Complex Numbers",
    category: "common-core-v1",
    track: "Graphics",
    verificationStatus: "verified-subject",
    questions: [
      { id: "fractol-sets", type: "checkbox", question: "Which fractal sets did you calculate?", options: ["Mandelbrot set", "Julia set (interactive mouse tracking)", "Burning Ship fractal", "Tricorn / custom fractal equation"] },
      { id: "fractol-bonus", type: "checkbox", question: "Extra features and optimizations?", options: ["Smooth mouse-centered zoom at pointer coordinates", "Keyboard panning and iteration depth adjustment", "Dynamic color palette cycling", "Multi-threading optimization"] },
    ],
  },
  {
    slug: "philosophers",
    aliases: ["philo"],
    name: "Philosophers",
    about: "A multithreaded simulation of the Dining Philosophers problem in C solving concurrency synchronization, race conditions, and starvation.",
    techStack: "C, POSIX threads, Mutexes, Concurrency",
    category: "common-core-v1",
    track: "Unix & Systems",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "philo-deadlock",
        type: "radio",
        question: "How did you prevent deadlocks and thread starvation?",
        options: [
          "Asymmetric fork picking order (odd vs. even philosopher indexing)",
          "Strict global mutex acquisition hierarchy",
          "Microsecond timestamp delta tracking with gettimeofday() and watchdog monitoring",
          "Atomic state evaluation with dedicated supervisor thread",
        ],
      },
      { id: "philo-bonus", type: "radio", question: "Did you complete the bonus implementation using multi-process architecture and POSIX named semaphores?", options: ["Yes", "No"] },
      { id: "philo-precision", type: "text", question: "What was your timing precision and leak status?", placeholder: "e.g., maintained < 5ms death detection accuracy and confirmed 0 data races with Helgrind / ThreadSanitizer" },
    ],
  },
  {
    slug: "minishell",
    aliases: [],
    name: "minishell",
    about: "A POSIX-compliant minimalist command shell in C reproducing Bash with lexical analysis, execution pipelines, redirections, and signal handling.",
    techStack: "C, Unix processes, POSIX Shell, Readline",
    category: "common-core-v1",
    track: "Unix & Systems",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "ms-parts",
        type: "checkbox",
        question: "Which core architectural subsystems did you write?",
        options: [
          "Lexer / tokenizer with quote state machine (single vs. double quotes)",
          "Abstract Syntax Tree (AST) or command table parser",
          "Multi-command pipeline execution using fork, pipe, and dup2",
          "File redirections (<, >, << here_doc, >> append)",
          "Environment variable expansion ($VAR, $?)",
          "Signal handling (Ctrl-C, Ctrl-\\, Ctrl-D) across parent and child processes",
          "Built-in commands (echo, cd, pwd, export, unset, env, exit)",
        ],
      },
      {
        id: "ms-safety",
        type: "checkbox",
        question: "What stability and safety guarantees did you enforce?",
        options: [
          "Zero memory leaks confirmed via Valgrind under continuous command execution",
          "File descriptor leak prevention by closing pipes across all process branches",
          "Proper child process exit status capture using waitpid() and WEXITSTATUS",
        ],
      },
    ],
  },
  {
    slug: "cub3d",
    aliases: [],
    name: "cub3D",
    about: "A first-person 3D raycasting engine in C inspired by Wolfenstein 3D, rendering realistic perspective walls from a 2D map using MiniLibX.",
    techStack: "C, MiniLibX, Raycasting, DDA",
    category: "common-core-v1",
    track: "Graphics",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "cub-features",
        type: "checkbox",
        question: "Which graphics and gameplay features did you engineer?",
        options: [
          "Digital Differential Analysis (DDA) raycasting algorithm",
          "Texture mapping with perspective wall slice scaling",
          "Player movement with wall collision physics and sliding",
          "Overhead 2D minimap with dynamic player view cone",
          "Animated sprites or interactive opening doors (bonus)",
          "Mouse-controlled camera rotation and ceiling/floor rendering",
        ],
      },
      { id: "cub-perf", type: "text", question: "How did you optimize raycasting and prevent distortion?", placeholder: "e.g., calculated perpendicular wall distance to eliminate fisheye distortion and maintained 60+ FPS" },
    ],
  },
  {
    slug: "minirt",
    aliases: [],
    name: "miniRT",
    about: "A 3D ray tracing engine in C computing geometric ray intersections, Phong reflection shading, and shadows from a scene description file.",
    techStack: "C, MiniLibX, Ray tracing, Linear Algebra",
    category: "common-core-v1",
    track: "Graphics",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "rt-objects",
        type: "checkbox",
        question: "Which 3D geometric primitives did you solve intersections for?",
        options: ["Spheres", "Planes", "Cylinders", "Cones or compound geometric shapes"],
      },
      {
        id: "rt-light",
        type: "checkbox",
        question: "Which lighting models and optical effects did you implement?",
        options: [
          "Ambient lighting",
          "Diffuse Lambertian reflection",
          "Specular Phong reflection highlights",
          "Hard shadow ray occlusion",
          "Multiple colored light sources",
        ],
      },
    ],
  },
  {
    slug: "netpractice",
    aliases: [],
    name: "NetPractice",
    about: "A hands-on networking training project configuring IPv4 addressing, CIDR subnet masks, default gateways, and multi-router routing tables.",
    techStack: "TCP/IP, Subnetting, CIDR, Routing",
    category: "common-core-v1",
    track: "DevOps & Cloud",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "np-topics",
        type: "checkbox",
        question: "What core networking problems did you solve?",
        options: [
          "Calculating VLSM / CIDR subnet masks and usable host ranges",
          "Differentiating private (RFC 1918) vs. public IP address blocks",
          "Configuring default gateways and static routing entries",
          "Resolving routing conflicts across multi-interface switches and routers",
        ],
      },
      { id: "np-scenarios", type: "text", question: "Which complex networking scenarios or subnet topologies did you configure?", placeholder: "e.g., solved 10 multi-router subnet configurations with custom CIDR masks and default gateways" },
    ],
  },
  {
    slug: "cpp-modules",
    aliases: ["cpp"],
    name: "C++ Modules",
    about: "A rigorous 10-module curriculum (CPP 00 through CPP 09) mastering modern object-oriented programming, templates, and the STL.",
    techStack: "C++98, OOP, Templates, STL",
    category: "common-core-v1",
    track: "Unix & Systems",
    verificationStatus: "verified-subject",
    questions: [
      { id: "cpp-done", type: "checkbox", question: "Which module tiers did you complete?", options: ["CPP 00 to 04 (OOP foundations, inheritance, polymorphism)", "CPP 05 to 09 (Exceptions, type casts, templates, STL containers)"] },
      {
        id: "cpp-topics",
        type: "checkbox",
        question: "Which C++ concepts did you implement in production-style code?",
        options: [
          "Orthodox Canonical Form and deep copy semantics",
          "Subtype polymorphism and pure virtual abstract interfaces",
          "Exception hierarchies with std::exception subclassing",
          "C++ type casting (static_cast, dynamic_cast, const_cast, reinterpret_cast)",
          "Generic template functions and classes",
          "STL algorithms and containers (vector, list, map, deque, stack)",
          "Ford-Johnson merge-insertion sorting algorithm (CPP 09)",
        ],
      },
      { id: "cpp-best", type: "text", question: "Which exercise are you most proud of?", placeholder: "e.g., Ford-Johnson PmergeMe container comparison in CPP 09, or RPN stack evaluator" },
    ],
  },
  {
    slug: "inception",
    aliases: [],
    name: "Inception",
    about: "A production DevOps system virtualization project orchestrating a multi-service LEMP stack with custom Dockerfiles and Docker Compose.",
    techStack: "Docker, Docker Compose, NGINX, MariaDB, WordPress, TLS",
    category: "common-core-v1",
    track: "DevOps & Cloud",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "inc-setup",
        type: "checkbox",
        question: "What infrastructure components did you build from scratch?",
        options: [
          "Custom Dockerfiles built on Alpine/Debian (zero pre-made DockerHub images)",
          "NGINX reverse proxy with TLS 1.2 / 1.3 self-signed certificates",
          "WordPress service orchestrated via php-fpm without NGINX bundling",
          "MariaDB database service with persistent volume storage",
          "Dedicated bridge network with secure intra-container DNS resolution",
          "Docker secrets management for database and administrative credentials",
        ],
      },
      { id: "inc-bonus", type: "checkbox", question: "Bonus microservices deployed?", options: ["Redis object cache", "FTP server container", "Adminer database management tool", "Static website container", "Portainer service monitoring"] },
    ],
  },
  {
    slug: "ft_irc",
    aliases: ["irc"],
    name: "ft_irc",
    about: "An RFC 1459 / RFC 2812 compliant Internet Relay Chat (IRC) server in C++ using non-blocking I/O multiplexing for concurrent clients.",
    techStack: "C++98, TCP Sockets, Non-blocking I/O, RFC 2812",
    category: "common-core-v1",
    track: "Unix & Systems",
    verificationStatus: "verified-subject",
    questions: [
      { id: "irc-io", type: "radio", question: "Which I/O multiplexing system call did you use?", options: ["poll()", "select()", "epoll()", "kqueue()"] },
      {
        id: "irc-features",
        type: "checkbox",
        question: "Which IRC protocol capabilities did you build?",
        options: [
          "RFC 2812 client registration and authentication (PASS, NICK, USER)",
          "Multi-channel management (JOIN, PART, PRIVMSG, TOPIC)",
          "Channel operator permissions and modes (+i invite-only, +t topic lock, +k key, +o op, +l limit)",
          "Operator administration commands (KICK, INVITE, MODE)",
          "Asynchronous partial packet buffering for fragmented TCP streams",
          "Custom IRC bot integration or DCC file transfer extension",
        ],
      },
    ],
  },
  {
    slug: "webserv",
    aliases: [],
    name: "webserv",
    about: "An RFC 7230 / RFC 7231 compliant HTTP/1.1 web server in C++ featuring non-blocking I/O multiplexing, custom configuration parsing, and CGI execution.",
    techStack: "C++98, HTTP/1.1, TCP Sockets, Non-blocking I/O, CGI",
    category: "common-core-v1",
    track: "Unix & Systems",
    verificationStatus: "verified-subject",
    questions: [
      { id: "ws-io", type: "radio", question: "Which I/O multiplexing system call powered your event loop?", options: ["poll()", "select()", "epoll()", "kqueue()"] },
      {
        id: "ws-features",
        type: "checkbox",
        question: "Which web server subsystems did you build?",
        options: [
          "Non-blocking single-threaded event loop handling concurrent clients",
          "NGINX-inspired configuration file parser supporting virtual hosts and routes",
          "HTTP/1.1 methods (GET, POST, DELETE) with status code generation",
          "Chunked transfer encoding and multipart/form-data file uploads",
          "CGI gateway script execution (Python, PHP) via pipes and environment variables",
          "Custom error pages, directory listing auto-index, and client body limits",
        ],
      },
      { id: "ws-perf", type: "text", question: "How did you test stress resilience and leak resistance?", placeholder: "e.g., benchmarked with siege -b and wrk, passing 500 concurrent connections with zero memory leaks" },
    ],
  },
  {
    slug: "ft_transcendence",
    aliases: ["transcendence"],
    name: "ft_transcendence",
    about: "Full-stack web application capstone: real-time multiplayer Pong tournament platform with user management, live chat, 2FA security, and microservices.",
    // No preset tech stack: teams select their own frontend, backend, database, and protocols
    techStack: "",
    category: "common-core-v1",
    track: "Web & Mobile",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "ft-stack",
        type: "text",
        question: "Which frontend, backend, and database technologies did your team select?",
        placeholder: "e.g., Next.js 14, NestJS / Django, PostgreSQL, Redis, WebSockets",
      },
      {
        id: "ft-features",
        type: "checkbox",
        question: "Which mandatory architectural modules did you build?",
        options: [
          "Real-time multiplayer Pong game engine",
          "Interactive tournament matchmaking system with bracket visualization",
          "Single-Page Application (SPA) architecture with client-side routing",
          "42 OAuth API login and Two-Factor Authentication (2FA via TOTP)",
          "Live chat with direct messaging, channels, and player invite/block controls",
          "User profile dashboards, avatar uploads, and match history statistics",
          "Microservices containerization with HTTPS reverse proxy",
        ],
      },
      {
        id: "ft-ownership",
        type: "text",
        question: "What were your personal module contributions and engineering ownership in the team?",
        placeholder: "e.g., I built the server-authoritative Pong game loop with 60 FPS physics in WebSockets, and implemented 2FA with TOTP",
      },
      {
        id: "ft-challenges",
        type: "text",
        question: "What was the hardest technical challenge, and how did you resolve it?",
        placeholder: "e.g., resolved network latency jitter in live Pong matches by implementing client interpolation and server reconciliation",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// 2. NEW 2026 COMMON CORE / 42NEXT GUIDES (v2: Python, AI, Constrained Decoding, RAG)
// ---------------------------------------------------------------------------
export const COMMON_CORE_V2_GUIDES: ProjectGuide[] = [
  {
    slug: "python-modules",
    aliases: ["python", "pypiscine"],
    name: "Python Modules (00–10)",
    about: "A progressive Python curriculum covering environment configuration, PEP 8 standards, OOP, polymorphic data streams, package architecture, and functional programming.",
    techStack: "Python",
    category: "common-core-v2",
    track: "General",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "py-modules",
        type: "checkbox",
        question: "Which module milestones did you complete?",
        options: [
          "Module 00: Environment setup, syntax, typing, and flake8 / PEP 8 compliance",
          "Modules 01–02: Array manipulation, matrices, and tabular data analysis (NumPy/Pandas)",
          "Modules 03–04: Object-oriented programming, magic/dunder methods, and data-oriented design",
          "Modules 05–07: Method overriding, polymorphic streams, abstract base classes, and package architecture",
          "Module 10: Functional programming (lambdas, closures, map/filter/reduce, currying)",
        ],
      },
      { id: "py-typing", type: "radio", question: "Did you use static type annotations throughout your solutions?", options: ["Yes (strict mypy / PEP 484)", "Partially / No"] },
      { id: "py-patterns", type: "text", question: "Which software design patterns or advanced features did you engineer?", placeholder: "e.g., engineered decorator wrappers for execution telemetry and abstract factory pattern for stream parsing" },
    ],
  },
  {
    slug: "a-maze-ing",
    aliases: ["amaz-ing", "amazing"],
    name: "A-Maze-ing",
    about: "An algorithmic maze generator and pathfinding solver in Python parsing configuration files, embedding a '42' logo pattern into walls, and finding optimal paths.",
    techStack: "Python, Algorithms",
    category: "common-core-v2",
    track: "Algorithms",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "amaze-algo",
        type: "radio",
        question: "Which algorithm did you engineer to generate the maze?",
        options: [
          "Prim's algorithm",
          "Kruskal's algorithm",
          "Recursive backtracking (Depth-First Search)",
          "Eller's algorithm / custom generation",
        ],
      },
      {
        id: "amaze-solve",
        type: "radio",
        question: "Which pathfinding search algorithm did you implement to solve the maze?",
        options: [
          "A* search algorithm with Manhattan distance heuristic",
          "Breadth-First Search (BFS) for shortest path guarantee",
          "Dijkstra's algorithm",
        ],
      },
      {
        id: "amaze-42",
        type: "text",
        question: "How did you implement the mandatory '42' logo wall pattern constraint?",
        placeholder: "e.g., reserved a central bounding box coordinate grid for the '42' bitmap and routed maze corridors around it",
      },
      {
        id: "amaze-vis",
        type: "checkbox",
        question: "Which visualization and output capabilities did you build?",
        options: [
          "Terminal ANSI / ASCII rendering with animated step playback",
          "Interactive graphical visualizer (Pygame / Tkinter)",
          "File export of generated maze layout and path coordinates",
        ],
      },
    ],
  },
  {
    slug: "call-me-maybe",
    aliases: ["callmemaybe"],
    name: "Call Me Maybe",
    about: "An AI system bridging natural language user prompts to structured JSON function calls using a local LLM with constrained decoding.",
    // No preset tech stack: students choose PyTorch vs HuggingFace vs ONNX vs llama.cpp vs GGUF
    techStack: "",
    category: "common-core-v2",
    track: "AI & Data Science",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "cmm-stack",
        type: "text",
        question: "Which local model, runtime, and tools did you use?",
        placeholder: "e.g., Qwen2.5-0.5B with Hugging Face Transformers and PyTorch, or llama.cpp",
      },
      {
        id: "cmm-decoding",
        type: "checkbox",
        question: "How did you enforce 100% valid schema-compliant function calls from the small LLM?",
        options: [
          "Token-level logit masking / logit bias manipulation during generation",
          "Trie-based / finite-state machine constrained grammar decoding",
          "Strict JSON Schema validation with programmatic retry loops",
          "Few-shot prompt engineering and structured system instructions",
        ],
      },
      {
        id: "cmm-tools",
        type: "text",
        question: "Which tool/function execution capabilities did you implement?",
        placeholder: "e.g., arithmetic calculator, weather API fetcher, and file system search tools",
      },
      {
        id: "cmm-metrics",
        type: "text",
        question: "What reliability gain did your constrained decoding achieve?",
        placeholder: "e.g., boosted valid JSON execution rate from ~30% unconstrained to 100% with zero parse errors",
      },
    ],
  },
  {
    slug: "fly-in",
    aliases: ["flyin"],
    name: "Fly-In",
    about: "A multi-agent pathfinding simulation in Python coordinating an autonomous fleet of drones through a network graph without mid-air collisions.",
    techStack: "Python, Graph Theory",
    category: "common-core-v2",
    track: "Algorithms",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "fly-algo",
        type: "radio",
        question: "Which multi-agent routing algorithm did you implement?",
        options: [
          "Conflict-Based Search (CBS) for collision-free multi-agent pathfinding",
          "Time-extended A* (A* with space-time reservation table)",
          "Priority-based cooperative pathfinding",
          "Network flow formulation (min-cost max-flow)",
        ],
      },
      {
        id: "fly-constraints",
        type: "checkbox",
        question: "Which physical and network constraints did your simulation handle?",
        options: [
          "Hub capacity and vertiport landing pad limits",
          "Vertex and edge collision avoidance (preventing head-on swaps)",
          "Drone battery life and recharge turnaround times",
          "Dynamic zone closures or restricted airspace",
        ],
      },
      {
        id: "fly-vis",
        type: "text",
        question: "How did you visualize or benchmark the simulation?",
        placeholder: "e.g., built a real-time 2D visualizer in Pygame and benchmarked turn efficiency across 50 drones",
      },
    ],
  },
  {
    slug: "codexion",
    aliases: [],
    name: "Codexion",
    about: "A concurrent programming simulation in C modeling developers competing for shared compilation and debugging hardware resources without deadlocks.",
    techStack: "C, POSIX Threads, Mutexes",
    category: "common-core-v2",
    track: "Unix & Systems",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "code-sync",
        type: "radio",
        question: "How did you synchronize access to shared compilation dongles and resources?",
        options: [
          "Resource hierarchy and asymmetric lock acquisition order",
          "Mutexes paired with condition variables for priority queues",
          "Atomic state checks and cooperative cooldown scheduling",
        ],
      },
      {
        id: "code-safety",
        type: "checkbox",
        question: "What concurrency safety properties did you enforce?",
        options: [
          "Zero deadlocks under maximum resource contention",
          "Zero thread starvation / burnout timeouts",
          "Zero data races verified using ThreadSanitizer / Valgrind Helgrind",
          "Microsecond timestamp precision and centralized state logging",
        ],
      },
      {
        id: "code-metrics",
        type: "text",
        question: "What was your timing precision and performance under high thread counts?",
        placeholder: "e.g., maintained simulation stability across 200 concurrent threads with < 10ms jitter",
      },
    ],
  },
  {
    slug: "rag-against-the-machine",
    aliases: ["rag-against-machine", "rag"],
    name: "RAG Against the Machine",
    about: "A Retrieval-Augmented Generation (RAG) CLI system in Python indexing local codebases and generating grounded developer answers with source attribution.",
    // No preset tech stack: students select their own vector store, retrieval index, and LLM backend
    techStack: "",
    category: "common-core-v2",
    track: "AI & Data Science",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "rag-stack",
        type: "text",
        question: "Which retrieval engine, vector store, and LLM backend did you select?",
        placeholder: "e.g., BM25S lexical search with sentence-transformers embeddings in ChromaDB, and local Qwen model",
      },
      {
        id: "rag-chunking",
        type: "checkbox",
        question: "How did you ingest and segment source code files?",
        options: [
          "AST-aware code chunking (preserving class, method, and function boundaries)",
          "Markdown header and docstring segmentation",
          "Sliding token window with configurable chunk overlap",
        ],
      },
      {
        id: "rag-retrieval",
        type: "checkbox",
        question: "Which retrieval and ranking methods did you build?",
        options: [
          "Lexical keyword retrieval using BM25 / TF-IDF",
          "Dense vector similarity search using cosine distance",
          "Hybrid search with Reciprocal Rank Fusion (RRF)",
          "Query re-ranking / cross-encoder scoring",
        ],
      },
      {
        id: "rag-generation",
        type: "text",
        question: "How did you structure context injection and eliminate hallucinations?",
        placeholder: "e.g., injected retrieved code snippets with strict file-path and line-number citations, enforcing fallback when confidence was low",
      },
    ],
  },
];

// Unified Common Core catalog containing both traditional v1 and 42Next v2 projects
export const COMMON_CORE_GUIDES: ProjectGuide[] = [
  ...COMMON_CORE_V1_GUIDES,
  ...COMMON_CORE_V2_GUIDES,
];

// ---------------------------------------------------------------------------
// 3. OUTER CIRCLE / SPECIALIZATION GUIDES
// ---------------------------------------------------------------------------
export const OUTER_CIRCLE_GUIDES: ProjectGuide[] = [
  // Cybersecurity & Reverse Engineering
  {
    slug: "snow-crash",
    aliases: ["snowcrash"],
    name: "Snow Crash",
    about: "An introduction to cyber security: finding and exploiting security vulnerabilities across 14 challenge levels on a custom Linux ISO.",
    techStack: "C, Assembly, GDB, Bash, Reverse Engineering",
    category: "outer-circle",
    track: "Cybersecurity",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "snow-vulns",
        type: "checkbox",
        question: "Which exploitation techniques did you execute?",
        options: [
          "Stack-based buffer overflows to hijack instruction pointers",
          "Format string vulnerabilities to leak memory and overwrite GOT entries",
          "Privilege escalation via insecure setuid binaries and environment tampering",
          "Shellcode injection into environment variables and stack buffers",
          "Reverse engineering binaries using GDB, objdump, and ltrace/strace",
        ],
      },
      { id: "snow-levels", type: "text", question: "Which was the most challenging level you solved?", placeholder: "e.g., Level 12: crafted format string payload to overwrite write() GOT address with system()" },
    ],
  },
  {
    slug: "rainfall",
    aliases: [],
    name: "Rainfall",
    about: "Advanced binary exploitation: exploiting stack and heap vulnerabilities, bypassing modern mitigations with ROP chains and return-to-libc.",
    techStack: "C, x86 Assembly, GDB, Shellcoding, Binary Exploitation",
    category: "outer-circle",
    track: "Cybersecurity",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "rainfall-techniques",
        type: "checkbox",
        question: "Which advanced binary exploitation methods did you implement?",
        options: [
          "Return-Oriented Programming (ROP) chain construction",
          "Return-to-libc attacks bypassing non-executable stack protections (NX/DEP)",
          "Stack pivoting and stack Canary bypass",
          "Heap buffer overflow and use-after-free exploitation",
          "Crafting custom polymorphic x86 assembly shellcodes",
        ],
      },
      { id: "rainfall-payload", type: "text", question: "Which level or exploit chain was the most complex?", placeholder: "e.g., constructed multi-stage ROP chain to bypass ASLR and spawn a root shell" },
    ],
  },
  {
    slug: "ft_malcolm",
    aliases: ["malcolm", "ft_shield"],
    name: "ft_malcolm",
    about: "A network security tool crafting raw Ethernet and ARP packets to detect or simulate Man-In-The-Middle (MITM) ARP spoofing.",
    techStack: "C, Raw Sockets, Networking, ARP",
    category: "outer-circle",
    track: "Cybersecurity",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "malcolm-packets",
        type: "checkbox",
        question: "Which raw socket and packet operations did you engineer?",
        options: [
          "Crafting raw Ethernet frame headers with broadcast and targeted MAC addresses",
          "Assembling ARP request and reply payloads with custom hardware/protocol IPs",
          "Listening on raw AF_PACKET sockets in promiscuous interface mode",
          "Detecting rogue ARP cache poisoning attacks on the local subnet",
        ],
      },
      { id: "malcolm-validation", type: "text", question: "How did you verify raw packet parsing and ARP response timing?", placeholder: "e.g., verified with Wireshark that target ARP cache was updated within 5ms of broadcast" },
    ],
  },
  {
    slug: "matt-daemon",
    aliases: ["matt_daemon"],
    name: "Matt-daemon",
    about: "A secure systems daemon in C/C++ running in background with file locking, signal handling, and remote encrypted logging.",
    techStack: "C++, Linux System Calls, Daemonization, Sockets",
    category: "outer-circle",
    track: "Unix & Systems",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "matt-daemon-features",
        type: "checkbox",
        question: "Which daemonization mechanisms did you implement?",
        options: [
          "Double-forking and setsid() session leader daemonization",
          "File locking using flock() / fcntl() to prevent duplicate daemon instances",
          "Signal masking and graceful shutdown handling (SIGTERM, SIGQUIT, SIGHUP)",
          "TCP server socket accepting remote client connections for administrative commands",
          "Tamper-evident system activity logging",
        ],
      },
      { id: "matt-network", type: "text", question: "How did you secure client communication and daemon logs?", placeholder: "e.g., implemented single-instance file locking with flock() and encrypted admin session commands" },
    ],
  },
  {
    slug: "woody-woodpacker",
    aliases: ["woody"],
    name: "Woody Woodpacker",
    about: "An ELF binary packer in C and x86-64 assembly that encrypts executable sections and injects a decryption stub executed at runtime.",
    techStack: "C, x86-64 Assembly, ELF Format, Cryptography",
    category: "outer-circle",
    track: "Cybersecurity",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "woody-features",
        type: "checkbox",
        question: "Which ELF manipulation and packing techniques did you execute?",
        options: [
          "Parsing 64-bit ELF headers, program headers, and section headers",
          "Symmetric encryption of the .text code section using RC4 or custom cipher",
          "Injecting a custom x86-64 assembly decryption stub into binary padding / cave",
          "Modifying the ELF entry point (e_entry) to execute the stub before the original code",
          "Preserving all registers, restoring memory permissions, and jumping to original OEP",
        ],
      },
      { id: "woody-stub", type: "text", question: "How did you engineer the assembly decryption stub and preserve program state?", placeholder: "e.g., wrote 64-bit asm stub in text segment cave that decrypted payload with RC4 and restored registers" },
    ],
  },
  {
    slug: "ft_ping",
    aliases: [],
    name: "ft_ping",
    about: "A rewrite of the Unix ping command in C using raw ICMP sockets to calculate network latency and round-trip time statistics.",
    techStack: "C, Raw Sockets, ICMP, IPv4",
    category: "outer-circle",
    track: "Unix & Systems",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "ping-features",
        type: "checkbox",
        question: "Which networking mechanisms did you implement?",
        options: [
          "Opening raw ICMP sockets (IPPROTO_ICMP) with administrative privileges",
          "Constructing ICMP Echo Request headers and computing 16-bit Internet checksums",
          "Parsing incoming IPv4 headers and extracting ICMP Echo Reply payloads",
          "DNS hostname resolution using getaddrinfo()",
          "Calculating RTT statistical metrics (min, avg, max, mdev / stddev)",
          "Handling TTL expiration, packet loss, and signal interruptions (SIGINT summary)",
        ],
      },
      { id: "ping-metrics", type: "text", question: "What packet statistics and network telemetry did your utility report?", placeholder: "e.g., calculated min/avg/max/stddev RTT down to microsecond precision and handled packet loss" },
    ],
  },
  {
    slug: "ft_traceroute",
    aliases: [],
    name: "ft_traceroute",
    about: "A rewrite of the Unix traceroute utility in C probing network hops by transmitting UDP/ICMP packets with incrementing TTLs.",
    techStack: "C, Raw Sockets, UDP, ICMP, IP Routing",
    category: "outer-circle",
    track: "Unix & Systems",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "traceroute-features",
        type: "checkbox",
        question: "Which routing probe techniques did you build?",
        options: [
          "Setting IP_TTL socket options with incrementing hop limits (1 to 30)",
          "Transmitting probe packets (UDP datagrams or ICMP Echo Requests)",
          "Catching ICMP Time Exceeded (Type 11) and Destination Unreachable (Type 3) replies",
          "Reverse DNS lookup to display intermediate router hostnames and IP addresses",
          "Measuring round-trip response latencies across 3 probes per hop",
        ],
      },
      { id: "traceroute-ttl", type: "text", question: "How did you handle probe timeouts and packet response parsing?", placeholder: "e.g., sent 3 UDP probes per hop, extracted intermediate IP headers, and handled non-responsive hops" },
    ],
  },
  {
    slug: "nm-otool",
    aliases: ["nm", "otool"],
    name: "nm-otool",
    about: "A binary reverse-engineering tool in C parsing ELF and Mach-O files to inspect symbol tables, section headers, and bytecode.",
    techStack: "C, ELF, Mach-O, Binary Parsing",
    category: "outer-circle",
    track: "Unix & Systems",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "nm-features",
        type: "checkbox",
        question: "Which binary formats and symbol properties did you decode?",
        options: [
          "Parsing ELF32 and ELF64 headers and section header tables",
          "Extracting symbol tables (.symtab) and string tables (.strtab)",
          "Determining symbol types (T, t, U, D, d, B, b, R, r) and addresses",
          "Handling Mach-O 32-bit and 64-bit universal fat binaries",
          "Safe memory-mapped I/O using mmap() with corrupted binary validation",
        ],
      },
      { id: "nm-symbols", type: "text", question: "Which binary architectures and symbol sorting did you support?", placeholder: "e.g., parsed 32/64-bit ELF and Mach-O fat binaries with alphabetic symbol table sorting" },
    ],
  },
  {
    slug: "ft_ssl",
    aliases: ["ft_ssl_md5", "ft_ssl_des", "ft_ssl_rsa"],
    name: "ft_ssl",
    about: "A cryptographic CLI utility suite in C implementing standard cryptographic hashing (MD5, SHA-256) and cipher encryption algorithms from RFC specs.",
    techStack: "C, Cryptography, RFC Standards, OpenSSL",
    category: "outer-circle",
    track: "Cybersecurity",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "ssl-algorithms",
        type: "checkbox",
        question: "Which cryptographic algorithms did you implement from scratch?",
        options: [
          "MD5 message digest algorithm (RFC 1321)",
          "SHA-256 secure hash algorithm (FIPS 180-2)",
          "DES (Data Encryption Standard) block cipher with key schedules",
          "Cipher Block Chaining (CBC) and Electronic Codebook (ECB) modes",
          "Base64 encoding and decoding filters",
        ],
      },
      { id: "ssl-perf", type: "text", question: "How did you verify hash accuracy against standard OpenSSL outputs?", placeholder: "e.g., tested MD5 and SHA256 against OpenSSL output on files up to 1GB with 100% byte parity" },
    ],
  },
  {
    slug: "kfs",
    aliases: ["kernel", "kfs-1", "kfs-2"],
    name: "KFS (Kernel From Scratch)",
    about: "A minimalist 32-bit x86 monolithic operating system kernel with custom bootloader, GDT, IDT, interrupt handlers, and keyboard drivers.",
    techStack: "C, x86 Assembly, OS Development, GDT/IDT",
    category: "outer-circle",
    track: "Unix & Systems",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "kfs-arch",
        type: "checkbox",
        question: "Which kernel subsystems did you engineer?",
        options: [
          "Multiboot specification header and protected-mode x86 entry",
          "Global Descriptor Table (GDT) segmentation setup",
          "Interrupt Descriptor Table (IDT) and Programmable Interrupt Controller (PIC) remapping",
          "Hardware Interrupt Service Routines (ISRs) for timer and keyboard",
          "VGA text-mode terminal driver with scrolling and cursor control",
          "Basic physical memory manager or kernel paging",
        ],
      },
      { id: "kfs-subsystems", type: "text", question: "How did you test interrupt handling and screen terminal output?", placeholder: "e.g., implemented hardware keyboard ISR with circular scancode buffer and VGA text scrolling" },
    ],
  },
  // AI & Data Science
  {
    slug: "ft_linear_regression",
    aliases: ["linear-regression"],
    name: "ft_linear_regression",
    about: "A machine learning program in Python that predicts car prices from mileage using gradient descent from scratch.",
    techStack: "Python, Machine Learning, Gradient Descent",
    category: "outer-circle",
    track: "AI & Data Science",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "lr-concepts",
        type: "checkbox",
        question: "Which machine learning techniques did you write from scratch?",
        options: [
          "Batch gradient descent optimization algorithm",
          "Feature scaling / standardization (z-score normalization)",
          "Mean Squared Error (MSE) cost function calculation",
          "Iterative model weight update loop and learning rate tuning",
          "Visualization of regression line and training loss curves",
        ],
      },
      { id: "lr-optimization", type: "text", question: "How did you tune learning rate and monitor cost convergence?", placeholder: "e.g., normalized mileage feature values and converged MSE within 1,000 gradient descent epochs" },
    ],
  },
  {
    slug: "dslr",
    aliases: ["data-science-logistic-regression"],
    name: "DSLR",
    about: "A data science project that trains a multiclass logistic regression classifier from scratch to sort students into Hogwarts houses.",
    techStack: "Python, Data Science, Logistic Regression, Feature Scaling",
    category: "outer-circle",
    track: "AI & Data Science",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "dslr-pipeline",
        type: "checkbox",
        question: "Which data analysis and modeling phases did you execute?",
        options: [
          "Data exploration: calculating count, mean, std, min, quartiles, and max from scratch",
          "Data visualization: pair plots, scatter plots, and feature histograms",
          "Feature selection to identify homogeneous and discriminative features",
          "One-vs-All (OvA) multiclass logistic regression with sigmoid function",
          "Model evaluation with precision, recall, and F1-score validation",
        ],
      },
      { id: "dslr-metrics", type: "text", question: "What classification accuracy and evaluation scores did your model achieve?", placeholder: "e.g., achieved 98.5% test accuracy across all 4 classes using One-vs-All logistic regression" },
    ],
  },
  {
    slug: "multilayer-perceptron",
    aliases: ["mlp"],
    name: "Multilayer Perceptron",
    about: "A feedforward neural network with backpropagation built from scratch without machine learning libraries to diagnose medical tumors.",
    techStack: "Python, Neural Networks, Backpropagation, Matrix Math",
    category: "outer-circle",
    track: "AI & Data Science",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "mlp-features",
        type: "checkbox",
        question: "Which neural network mechanisms did you build from scratch?",
        options: [
          "Configurable multi-layer architecture (input, hidden layers, output)",
          "Forward propagation with activation functions (Sigmoid, ReLU, Softmax)",
          "Binary cross-entropy loss computation with regularization",
          "Backpropagation with analytical gradient calculation using chain rule",
          "Mini-batch gradient descent optimizer and learning curves plotting",
        ],
      },
      { id: "mlp-topology", type: "text", question: "What network architecture and training accuracy did you achieve?", placeholder: "e.g., trained 2-hidden-layer network (30-24-24-2) reaching 97% binary classification accuracy" },
    ],
  },
  {
    slug: "computorv1",
    aliases: ["computor"],
    name: "Computor V1",
    about: "A mathematical polynomial equation solver that simplifies expressions and computes real or complex roots up to degree 2.",
    techStack: "C++ / Python, Mathematics, Parsing, Polynomials",
    category: "outer-circle",
    track: "Algorithms",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "computor-features",
        type: "checkbox",
        question: "Which equation solving capabilities did you build?",
        options: [
          "Lexing and parsing mathematical terms with arbitrary power exponents",
          "Simplification and polynomial reduction to canonical form (ax^2 + bx + c = 0)",
          "Determining polynomial degree (0, 1, or 2)",
          "Discriminant (Δ) computation and real distinct roots",
          "Complex conjugate root calculation for negative discriminants",
        ],
      },
      { id: "computor-precision", type: "text", question: "How did your parser format solutions and handle edge cases?", placeholder: "e.g., formatted irreducible fractions and handled complex conjugate roots with negative discriminants" },
    ],
  },
  {
    slug: "le-min",
    aliases: ["lemin"],
    name: "Lem-in",
    about: "A graph theory algorithm project routing ants through an ant farm using maximum flow algorithms to achieve the minimum number of turns.",
    techStack: "C, Graph Theory, Max Flow, BFS",
    category: "outer-circle",
    track: "Algorithms",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "lemin-algo",
        type: "radio",
        question: "Which graph flow algorithm did you implement?",
        options: [
          "Edmonds-Karp algorithm (BFS augmenting paths)",
          "Dinic's algorithm (level graphs and blocking flows)",
          "Suurballe's algorithm for edge-disjoint path finding",
          "Custom multi-path optimization",
        ],
      },
      { id: "lemin-turns", type: "text", question: "What turn counts did your algorithm achieve on 1,000+ room graphs?", placeholder: "e.g., routed 100 ants in under 25 turns across 5 disjoint paths" },
    ],
  },
  // 3D Graphics & Game Development
  {
    slug: "scop",
    aliases: [],
    name: "SCOP",
    about: "A 3D graphics rendering engine in C++ with modern OpenGL shaders (GLSL), Wavefront OBJ file loading, and virtual camera controls.",
    techStack: "C++, Modern OpenGL, GLSL, 3D Graphics",
    category: "outer-circle",
    track: "Graphics",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "scop-pipeline",
        type: "checkbox",
        question: "Which OpenGL graphics pipeline components did you build?",
        options: [
          "Vertex Array Objects (VAO) and Vertex Buffer Objects (VBO) management",
          "Compiling and linking custom Vertex and Fragment shaders in GLSL",
          "Parsing Wavefront 3D .obj geometry files (vertices, faces, normals)",
          "Model, View, Projection (MVP) matrix transformations and camera navigation",
          "Texture mapping, procedural UV generation, and smooth lighting interpolation",
        ],
      },
      { id: "scop-shaders", type: "text", question: "What GLSL lighting and texture effects did you write?", placeholder: "e.g., implemented smooth Phong shading, texture blending, and 60 FPS camera rotation matrices" },
    ],
  },
  {
    slug: "humangl",
    aliases: [],
    name: "HumanGL",
    about: "A hierarchical 3D animated character in OpenGL with matrix transformation stacks and keyframed joint movements.",
    techStack: "C++, OpenGL, Matrix Math, 3D Animation",
    category: "outer-circle",
    track: "Graphics",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "humangl-features",
        type: "checkbox",
        question: "Which hierarchical 3D animation systems did you implement?",
        options: [
          "Hierarchical scene graph with parent-child matrix transformation inheritance",
          "Articulated human limbs with rotational constraints on joints",
          "Keyframe animation system with interpolation for walking and running cycles",
          "Interactive camera controls and joint selection UI",
        ],
      },
      { id: "humangl-kinematics", type: "text", question: "How did you structure the transformation matrix stack for joint animation?", placeholder: "e.g., implemented matrix push/pop stack to propagate rotational transforms to limbs in real time" },
    ],
  },
  {
    slug: "doom-nukem",
    aliases: ["doom_nukem"],
    name: "Doom-Nukem",
    about: "A 2.5D retro game engine in C with sector-based rendering, player physics, textured walls, audio, and custom level editor.",
    techStack: "C, SDL2, Game Engine, Physics",
    category: "outer-circle",
    track: "Graphics",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "doom-engine",
        type: "checkbox",
        question: "Which game engine subsystems did you develop?",
        options: [
          "Sector-based rendering engine supporting variable ceiling and floor heights",
          "Collision detection and gravity / jumping player physics",
          "Wall and floor perspective-correct texture mapping",
          "Interactive level editor with real-time sector geometry creation",
          "Enemy AI pathfinding and combat mechanics",
        ],
      },
      { id: "doom-features", type: "text", question: "What was the most challenging engine or physics feature you built?", placeholder: "e.g., implemented non-orthogonal wall rendering, player jumping physics, and custom map file serialization" },
    ],
  },
  // Web & Mobile Applications
  {
    slug: "matcha",
    aliases: [],
    name: "Matcha",
    about: "A full-stack dating web platform featuring geolocation search, real-time messaging, notification websockets, and profile matching algorithms.",
    // No preset tech stack: students choose their web stack
    techStack: "",
    category: "outer-circle",
    track: "Web & Mobile",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "matcha-features",
        type: "checkbox",
        question: "Which full-stack capabilities did you engineer?",
        options: [
          "Geolocation distance querying and interactive matching filters",
          "Real-time chat and notification delivery over WebSockets",
          "User popularity score rating algorithm based on profile interactions",
          "Secure user authentication with email verification and password hashing",
          "Multi-image profile gallery with thumbnail generation",
        ],
      },
      { id: "matcha-stack", type: "text", question: "Which tools did you choose, and what was your role?", placeholder: "e.g., built Node/Express backend with WebSockets and PostgreSQL geolocation distance queries" },
    ],
  },
  {
    slug: "hypertube",
    aliases: [],
    name: "Hypertube",
    about: "A full-stack video streaming web application that downloads, transcodes via FFmpeg, and streams video torrents directly in the browser.",
    // No preset tech stack: students choose their web stack
    techStack: "",
    category: "outer-circle",
    track: "Web & Mobile",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "hypertube-features",
        type: "checkbox",
        question: "Which streaming and media architectures did you build?",
        options: [
          "BitTorrent client integration for peer-to-peer piecewise video retrieval",
          "Real-time video transcoding using FFmpeg pipes for browser-compatible HTML5 playback",
          "Subtitles search and automatic vtt format synchronization",
          "OAuth2 social authentication (42, GitHub, Google)",
          "Background cron caching and disk quota clean-up daemon",
        ],
      },
      { id: "hypertube-transcoding", type: "text", question: "How did you manage video piece downloading and live streaming?", placeholder: "e.g., piped downloaded torrent byte chunks into FFmpeg to begin playback before full download completed" },
    ],
  },
  {
    slug: "swifty-companion",
    aliases: ["companion"],
    name: "Swifty Companion",
    about: "A native iOS application in Swift that connects to the 42 OAuth API to display student profiles, skills radar charts, and project history.",
    techStack: "Swift, iOS, OAuth2",
    category: "outer-circle",
    track: "Web & Mobile",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "swifty-features",
        type: "checkbox",
        question: "Which native mobile app features did you deliver?",
        options: [
          "OAuth 2.0 authorization code flow with secure Keychain token storage",
          "Fetching and parsing nested JSON data from 42 REST API endpoints",
          "Interactive skills radar chart visualizing student competencies",
          "Search interface with autocomplete and profile caching",
          "Responsive UIKit / SwiftUI layouts supporting dark mode and all iPhone sizes",
        ],
      },
      { id: "swifty-features-text", type: "text", question: "What was the most complex UI or networking feature you engineered?", placeholder: "e.g., built custom CoreGraphics radar chart and implemented OAuth token refresh handling" },
    ],
  },
];

// ---------------------------------------------------------------------------
// 4. PISCINE & GATEWAY GUIDES
// ---------------------------------------------------------------------------
export const PISCINE_GUIDES: ProjectGuide[] = [
  {
    slug: "c-piscine",
    aliases: ["piscine", "piscine-c"],
    name: "C Piscine",
    about: "An intensive 4-week coding bootcamp covering Unix shell scripting, C fundamentals, pointers, algorithms, and data structures.",
    techStack: "C, Shell, Git, Vim",
    category: "piscine",
    track: "General",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "piscine-modules",
        type: "checkbox",
        question: "Which piscine curriculum modules did you complete?",
        options: [
          "Shell 00 and Shell 01 (Unix permissions, grep, find, sed, bash scripting)",
          "C 00 to C 05 (Pointers, pointer arithmetic, string manipulation, recursion)",
          "C 06 to C 09 (Program arguments, dynamic memory allocation with malloc/free)",
          "C 10 to C 13 (File descriptors, binary operations, function pointers, linked lists)",
          "Weekend Rush group projects and final exam",
        ],
      },
      { id: "piscine-mentorship", type: "text", question: "Did you mentor peers, lead workshops, or evaluate student code?", placeholder: "e.g., conducted 30+ peer evaluations and assisted peers with pointers and memory debugging" },
    ],
  },
  {
    slug: "bsq",
    aliases: [],
    name: "BSQ",
    about: "A C program that finds the largest possible square on an obstacle-filled grid map using 2D dynamic programming.",
    techStack: "C, Dynamic Programming, Grid Algorithms",
    category: "piscine",
    track: "Algorithms",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "bsq-features",
        type: "checkbox",
        question: "Which algorithmic and I/O techniques did you engineer?",
        options: [
          "2D dynamic programming matrix algorithm (O(N*M) time complexity)",
          "Optimized line-by-line buffered reading for million-character map files",
          "Strict map format validation (dimensions, character set, obstacle consistency)",
          "Efficient memory management reusing rolling rows to minimize memory overhead",
        ],
      },
      { id: "bsq-perf", type: "text", question: "What dynamic programming algorithm and time complexity did you achieve?", placeholder: "e.g., achieved O(N*M) time and O(M) space complexity, processing 10,000-line maps in < 0.2s" },
    ],
  },
  {
    slug: "rush-01",
    aliases: ["rush01"],
    name: "Rush 01",
    about: "A 4x4 skyscraper grid puzzle solver in C using recursive backtracking and constraint propagation.",
    techStack: "C, Backtracking, Recursion",
    category: "piscine",
    track: "Algorithms",
    verificationStatus: "verified-subject",
    questions: [
      {
        id: "rush-features",
        type: "checkbox",
        question: "Which logic puzzle solving methods did you implement?",
        options: [
          "Recursive depth-first backtracking search",
          "Line-of-sight visibility constraint verification (top, bottom, left, right)",
          "Unique digit row and column constraint checking (Sudoku-style)",
          "Early pruning of invalid recursive branches to accelerate search",
        ],
      },
      { id: "rush-backtracking", type: "text", question: "How did you implement constraint checking and branch pruning?", placeholder: "e.g., validated skyscraper visibility counts early to prune invalid permutations from recursive search" },
    ],
  },
];

// Unified catalog of all verified 42 curriculum project guides (50 projects total)
export const PROJECT_GUIDES: ProjectGuide[] = [
  ...COMMON_CORE_V1_GUIDES,
  ...COMMON_CORE_V2_GUIDES,
  ...OUTER_CIRCLE_GUIDES,
  ...PISCINE_GUIDES,
];

// Helper to identify if a category is part of the 42 Common Core (v1 or v2)
export function isCommonCore(category: CurriculumCategory | string): boolean {
  return category === "common-core-v1" || category === "common-core-v2" || category === "common-core";
}

// ---------------------------------------------------------------------------
// 5. COMMON QUESTIONS (Asked for every project)
// ---------------------------------------------------------------------------
export const COMMON_PROJECT_QUESTIONS: GuideQuestion[] = [
  { id: "team", type: "radio", question: "Did you work alone or in a team?", options: ["Alone", "With 1 other student", "In a team of 3 or more"] },
  { id: "own-part", type: "text", question: "What did you build yourself?", placeholder: "e.g., I wrote the parser and all the error messages" },
  { id: "hard-part", type: "text", question: "What was the hardest problem, and how did you fix it?", placeholder: "e.g., the program froze with many threads, so I changed the order of the locks" },
  { id: "numbers", type: "text", question: "Any numbers you are sure about? (optional)", placeholder: "e.g., 0 memory leaks, 500 numbers sorted in under 5,500 moves" },
];

// ---------------------------------------------------------------------------
// 6. NON-42 PROJECT ARCHETYPES (Personal, Freelance, Hackathon, Open-Source)
// ---------------------------------------------------------------------------
export const PERSONAL_PROJECT_QUESTIONS: GuideQuestion[] = [
  {
    id: "about",
    type: "text",
    question: "What problem does this project solve, and who is it built for?",
    placeholder: "e.g., a real-time collaborative code editor for remote pair programming",
  },
  {
    id: "architecture",
    type: "text",
    question: "What is the core architecture and technical stack?",
    placeholder: "e.g., Next.js frontend with WebSockets, Node.js worker microservices, and Redis Pub/Sub",
  },
  {
    id: "technical-challenge",
    type: "text",
    question: "What was the most challenging technical feature you engineered?",
    placeholder: "e.g., implemented Operational Transformation conflict resolution under high latency conditions",
  },
  {
    id: "metrics",
    type: "text",
    question: "Any verified numbers, performance gains, or scale? (optional)",
    placeholder: "e.g., handles 1,000 concurrent socket connections with < 25ms round-trip latency",
  },
];

export const FREELANCE_PROJECT_QUESTIONS: GuideQuestion[] = [
  {
    id: "about",
    type: "text",
    question: "What was the client's business requirement or problem statement?",
    placeholder: "e.g., migrated an on-premise inventory system to a cloud-native SaaS platform",
  },
  {
    id: "deliverables",
    type: "text",
    question: "What production deliverables and features did you engineer?",
    placeholder: "e.g., automated Stripe billing integration, role-based access control, and analytics dashboard",
  },
  {
    id: "production-stack",
    type: "text",
    question: "Which production tools and deployment infrastructure did you use?",
    placeholder: "e.g., React, TypeScript, FastAPI, PostgreSQL on AWS ECS with Terraform",
  },
  {
    id: "business-impact",
    type: "text",
    question: "What was the outcome, timeline, or business impact? (optional)",
    placeholder: "e.g., delivered 2 weeks ahead of deadline; reduced monthly cloud infrastructure cost by 35%",
  },
];

export const HACKATHON_PROJECT_QUESTIONS: GuideQuestion[] = [
  {
    id: "about",
    type: "text",
    question: "What was the hackathon name, sprint duration, and challenge theme?",
    placeholder: "e.g., HackAbuDhabi 2024 (36-hour sprint): built an AI medical triage assistant",
  },
  {
    id: "hackathon-role",
    type: "text",
    question: "What was your team size and your personal technical role?",
    placeholder: "e.g., team of 4; I architected the real-time speech processing pipeline and backend API",
  },
  {
    id: "innovation",
    type: "text",
    question: "What working prototype or core innovation did you deliver?",
    placeholder: "e.g., offline-first mobile app with local Whisper quantization running entirely on-device",
  },
  {
    id: "award",
    type: "text",
    question: "Did you win any prize, placement, or judge commendation? (optional)",
    placeholder: "e.g., awarded 1st Place overall out of 45 competing engineering teams",
  },
];

export const OPEN_SOURCE_QUESTIONS: GuideQuestion[] = [
  {
    id: "about",
    type: "text",
    question: "Which open-source project or repository did you contribute to?",
    placeholder: "e.g., contributed to facebook/react or vercel/next.js",
  },
  {
    id: "pr-scope",
    type: "text",
    question: "What issue, bug, or feature did your pull request address?",
    placeholder: "e.g., fixed memory leak in connection pool reconnect loop under network partitions",
  },
  {
    id: "solution",
    type: "text",
    question: "What technical implementation, refactoring, or tests did you write?",
    placeholder: "e.g., added exponential backoff retry handler and 14 unit test assertions with Jest",
  },
  {
    id: "merge-status",
    type: "text",
    question: "What was the PR review and merge outcome? (optional)",
    placeholder: "e.g., code reviewed by core maintainers and merged into v14.2 release",
  },
];

// Preserved for backwards compatibility with existing references
export const OTHER_PROJECT_QUESTIONS: GuideQuestion[] = [
  { id: "about", type: "text", question: "What is the project, in one sentence?", placeholder: "e.g., a website where students swap old books" },
  { id: "features", type: "text", question: "What can it do?", placeholder: "e.g., search books, chat with the owner, get an email when a book is free" },
];

export type ProjectArchetype = "personal" | "freelance" | "hackathon" | "open-source";

/**
 * Heuristically detects the archetype of a non-42 project based on name, role, link, or description.
 * If an explicit archetypeOverride is present, it strictly takes precedence over heuristic detection.
 * Does NOT match bare "hack" (e.g. ethical hack, hack the box, kernel hack are personal/security projects).
 */
export function detectProjectArchetype(item?: string | {
  name?: string;
  description?: string;
  role?: string;
  link?: string;
  archetypeOverride?: ProjectArchetype;
}): ProjectArchetype {
  if (!item) return "personal";

  if (typeof item === "string") {
    return detectProjectArchetype({ name: item });
  }

  // 1. Explicit manual user/data-model override takes absolute precedence
  if (item.archetypeOverride) {
    return item.archetypeOverride;
  }

  const name = (item.name || "").toLowerCase();
  const desc = (item.description || "").toLowerCase();
  const role = (item.role || "").toLowerCase();
  const text = `${name} ${desc} ${role} ${(item.link || "").toLowerCase()}`;

  // 2. Strict Hackathon match: requires explicit "hackathon", "game jam", or recognized hackathon sprint
  // Note: Bare "hack" is explicitly excluded to prevent classifying security/systems projects as hackathons.
  if (/\b(hackathon|game\s*jam|devpost|hackmit|hackzurich|hacktech|hackabudhabi|ethglobal)\b/i.test(text)) {
    return "hackathon";
  }

  // 3. Strict Freelance / Commercial client contract match
  if (
    /\b(freelance|client\s*work|client\s*project|contract\s*work|consulting\s*project|commercial\s*contract)\b/i.test(text) ||
    /\b(freelancer|contractor|consultant)\b/i.test(role)
  ) {
    return "freelance";
  }

  // 4. Strict Open Source match: requires explicit open-source or pull request terminology
  if (
    /\b(open[-\s]?source|pull\s*request|\bpr\s*#?\d+|\bupstream\s*contribution)\b/i.test(text) ||
    /\b(contributor|open\s*source\s*maintainer)\b/i.test(role)
  ) {
    return "open-source";
  }

  // 5. Default archetype
  return "personal";
}

/**
 * Returns tailored question sets for non-42 projects according to their archetype.
 */
export function getNon42ProjectQuestions(item?: string | {
  name?: string;
  description?: string;
  role?: string;
  link?: string;
  archetypeOverride?: ProjectArchetype;
}): GuideQuestion[] {
  const archetype = detectProjectArchetype(item);
  switch (archetype) {
    case "hackathon":
      return HACKATHON_PROJECT_QUESTIONS;
    case "freelance":
      return FREELANCE_PROJECT_QUESTIONS;
    case "open-source":
      return OPEN_SOURCE_QUESTIONS;
    case "personal":
    default:
      return PERSONAL_PROJECT_QUESTIONS;
  }
}

// ---------------------------------------------------------------------------
// 7. EXPERIENCE & ACTIVITY QUESTIONS
// ---------------------------------------------------------------------------
export const EXPERIENCE_QUESTIONS: GuideQuestion[] = [
  { id: "about", type: "text", question: "What does the company or team do?", placeholder: "e.g., a small startup that makes a food delivery app" },
  { id: "tasks", type: "text", question: "What did you do there, day to day?", placeholder: "e.g., fixed bugs on the website, wrote tests, joined code reviews" },
  { id: "proud", type: "text", question: "What are you most proud of from this job?", placeholder: "e.g., I made the search page load much faster" },
  { id: "tools", type: "text", question: "Which tools or languages did you use?", placeholder: "e.g., React, Node.js, Git, Jira" },
  { id: "numbers", type: "text", question: "Any numbers you are sure about? (optional)", placeholder: "e.g., page load went from 4s to 1s; 3 people in my team" },
];

export const ACTIVITY_QUESTIONS: GuideQuestion[] = [
  { id: "about", type: "text", question: "What is this group or role about?", placeholder: "e.g., helping new students during the Piscine" },
  { id: "tasks", type: "text", question: "What did you do?", placeholder: "e.g., answered questions, checked code, ran a weekly workshop" },
  { id: "result", type: "text", question: "What changed thanks to you?", placeholder: "e.g., more students in my group passed the first exam" },
  { id: "numbers", type: "text", question: "Any numbers you are sure about? (optional)", placeholder: "e.g., helped about 40 students over 2 months" },
];

const normalize = (value: string) =>
  (value || "").toLowerCase().replace(/^42cursus[-_]?/, "").replace(/[^a-z0-9]/g, "");

/**
 * Finds the guide for a 42 project from its Intra slug or its display name.
 * Returns undefined for non-42 projects.
 */
export function findProjectGuide(slug?: string, name?: string): ProjectGuide | undefined {
  const keys = [normalize(slug || ""), normalize(name || "")].filter(Boolean);
  if (keys.length === 0) return undefined;

  // C++ modules come as cpp-module-00 ... cpp-module-09 on the Intra.
  if (keys.some((k) => /^cpp(module)?s?\d*$/.test(k))) {
    return PROJECT_GUIDES.find((g) => g.slug === "cpp-modules");
  }

  // Python modules come as python-module-00 ... python-module-10 on the Intra.
  if (keys.some((k) => /^python(module)?s?\d*$/.test(k))) {
    return PROJECT_GUIDES.find((g) => g.slug === "python-modules");
  }

  // Exact normalized match against slug, name, or aliases
  for (const guide of PROJECT_GUIDES) {
    const names = [guide.slug, guide.name, ...guide.aliases].map(normalize);
    if (keys.some((k) => names.includes(k))) return guide;
  }

  // Loose match for slugs like "42cursus-minishell-v2" or "minishell-v2"
  // Restricted to main slug length >= 5 characters to avoid false positive collisions (e.g. "ft" matching "libft")
  for (const guide of PROJECT_GUIDES) {
    const main = normalize(guide.slug);
    if (main.length >= 5 && keys.some((k) => k.includes(main))) return guide;
  }

  return undefined;
}
