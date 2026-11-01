// Facts and questions about 42 projects. Used by the "Help me write" bullet helper.
// Questions are about what the student really did, so every CV ends up different.

export interface GuideQuestion {
  id: string;
  type: "checkbox" | "radio" | "text";
  question: string;
  options?: string[];
  placeholder?: string;
}

export interface ProjectGuide {
  slug: string;
  aliases: string[];
  name: string;
  // One plain sentence: what the project is.
  about: string;
  // Tools every student uses for this project. Empty when it depends on the team.
  techStack: string;
  questions: GuideQuestion[];
}

export const PROJECT_GUIDES: ProjectGuide[] = [
  {
    slug: "libft",
    aliases: [],
    name: "Libft",
    about: "A C library rewritten from scratch: string, memory and list functions from libc, used in later projects.",
    techStack: "C, Make",
    questions: [
      { id: "libft-bonus", type: "radio", question: "Did you do the bonus part (linked lists)?", options: ["Yes", "No"] },
      { id: "libft-extra", type: "text", question: "Did you add your own functions to it later?", placeholder: "e.g., added get_next_line and ft_printf so I could reuse them" },
    ],
  },
  {
    slug: "ft_printf",
    aliases: ["printf"],
    name: "ft_printf",
    about: "A rewrite of the C printf function that handles a variable number of arguments.",
    techStack: "C, Make",
    questions: [
      { id: "printf-specifiers", type: "checkbox", question: "Which conversions did you support?", options: ["%c", "%s", "%p", "%d / %i", "%u", "%x / %X", "%%"] },
      { id: "printf-bonus", type: "radio", question: "Did you do the bonus flags (width, precision, #, +, space)?", options: ["Yes", "No"] },
    ],
  },
  {
    slug: "get_next_line",
    aliases: ["gnl"],
    name: "get_next_line",
    about: "A C function that reads a file one line at a time, using a static buffer.",
    techStack: "C",
    questions: [
      { id: "gnl-bonus", type: "radio", question: "Can it read from several files at the same time (bonus)?", options: ["Yes", "No"] },
      { id: "gnl-tests", type: "text", question: "How did you test it?", placeholder: "e.g., tried buffer sizes from 1 to 10,000,000 and checked for leaks with Valgrind" },
    ],
  },
  {
    slug: "born2beroot",
    aliases: ["b2br"],
    name: "Born2beRoot",
    about: "Setting up a secure Linux server in a virtual machine, with strict user and password rules.",
    techStack: "Linux, SSH, UFW, LVM",
    questions: [
      { id: "b2br-os", type: "radio", question: "Which Linux did you use?", options: ["Debian", "Rocky Linux"] },
      {
        id: "b2br-security",
        type: "checkbox",
        question: "What did you set up?",
        options: ["Encrypted disk with LVM", "UFW firewall and SSH on a custom port", "Strong password rules", "Strict sudo rules with logs", "A monitoring script run by cron"],
      },
      { id: "b2br-bonus", type: "checkbox", question: "Bonus services?", options: ["WordPress with Lighttpd", "Another service of my choice"] },
    ],
  },
  {
    slug: "push_swap",
    aliases: [],
    name: "push_swap",
    about: "Sorting numbers with two stacks and a small set of moves, using as few moves as possible.",
    techStack: "C, Algorithms",
    questions: [
      {
        id: "ps-algorithm",
        type: "radio",
        question: "Which sorting method did you use?",
        options: ["Turk algorithm (cheapest move)", "Radix sort", "Chunks", "My own method"],
      },
      { id: "ps-moves", type: "text", question: "About how many moves for 100 and 500 numbers?", placeholder: "e.g., under 700 moves for 100 numbers and 5,500 for 500" },
    ],
  },
  {
    slug: "pipex",
    aliases: [],
    name: "pipex",
    about: "A C program that copies how the shell connects commands with pipes and redirections.",
    techStack: "C, Unix processes, Pipes",
    questions: [
      {
        id: "pipex-bonus",
        type: "checkbox",
        question: "Which bonus parts did you do?",
        options: ["Any number of commands", "here_doc (<<) and append (>>)"],
      },
    ],
  },
  {
    slug: "minitalk",
    aliases: [],
    name: "minitalk",
    about: "A client and server in C that send text to each other using only two Unix signals.",
    techStack: "C, Unix signals",
    questions: [
      { id: "mt-bonus", type: "checkbox", question: "Bonus parts?", options: ["Server confirms each message", "Unicode (emoji, accents) support"] },
    ],
  },
  {
    slug: "so_long",
    aliases: [],
    name: "so_long",
    about: "A small 2D game in C with MiniLibX, with map checks so every map can be finished.",
    techStack: "C, MiniLibX",
    questions: [
      { id: "sl-check", type: "radio", question: "How did you check that the map can be finished?", options: ["Flood fill", "BFS", "DFS"] },
      { id: "sl-bonus", type: "checkbox", question: "Bonus parts?", options: ["Enemies", "Animations", "Move counter on screen"] },
    ],
  },
  {
    slug: "fdf",
    aliases: [],
    name: "FdF",
    about: "A C program that draws a 3D wireframe map from a file of heights, using MiniLibX.",
    techStack: "C, MiniLibX",
    questions: [
      {
        id: "fdf-features",
        type: "checkbox",
        question: "What can your program do?",
        options: ["Draw lines with Bresenham's algorithm", "Switch between views", "Rotate, move and zoom", "Colors based on height"],
      },
    ],
  },
  {
    slug: "fract-ol",
    aliases: ["fractol"],
    name: "fract-ol",
    about: "A C program that draws fractals like Mandelbrot and Julia sets, with zoom, using MiniLibX.",
    techStack: "C, MiniLibX",
    questions: [
      { id: "fractol-sets", type: "checkbox", question: "Which fractals did you draw?", options: ["Mandelbrot", "Julia", "Burning Ship", "Another one"] },
      { id: "fractol-bonus", type: "checkbox", question: "Extra features?", options: ["Zoom follows the mouse", "Move with arrow keys", "Color shift"] },
    ],
  },
  {
    slug: "philosophers",
    aliases: ["philo"],
    name: "Philosophers",
    about: "The dining philosophers problem in C: many threads share forks without getting stuck.",
    techStack: "C, POSIX threads, Mutexes",
    questions: [
      {
        id: "philo-deadlock",
        type: "radio",
        question: "How did you stop the philosophers from getting stuck?",
        options: ["Odd and even philosophers take forks in a different order", "Forks are always taken in the same order", "Timing and state checks"],
      },
      { id: "philo-bonus", type: "radio", question: "Did you do the bonus (processes and semaphores)?", options: ["Yes", "No"] },
    ],
  },
  {
    slug: "minishell",
    aliases: [],
    name: "minishell",
    about: "A small Unix shell in C, like a simple bash: it reads commands, handles quotes, pipes and redirections.",
    techStack: "C, Unix processes, Readline",
    questions: [
      {
        id: "ms-parts",
        type: "checkbox",
        question: "Which parts did you write?",
        options: [
          "Splitting the input into tokens",
          "Parsing commands",
          "Built-in commands (cd, echo, env, export, unset, pwd, exit)",
          "Pipes and redirections (<, >, <<, >>)",
          "Signals (Ctrl-C, Ctrl-\\, Ctrl-D)",
          "Variables ($HOME, $?) and quotes",
        ],
      },
    ],
  },
  {
    slug: "cub3d",
    aliases: [],
    name: "cub3D",
    about: "A first-person 3D maze game in C using raycasting, inspired by Wolfenstein 3D.",
    techStack: "C, MiniLibX, Raycasting",
    questions: [
      {
        id: "cub-features",
        type: "checkbox",
        question: "Which features did you build?",
        options: ["Raycasting (DDA)", "Wall textures", "Moving with wall collisions", "Minimap", "Doors or animated sprites", "Turning with the mouse"],
      },
    ],
  },
  {
    slug: "minirt",
    aliases: [],
    name: "miniRT",
    about: "A small ray tracer in C that draws 3D scenes with light and shadows from a scene file.",
    techStack: "C, MiniLibX, Ray tracing",
    questions: [
      { id: "rt-objects", type: "checkbox", question: "Which shapes can it draw?", options: ["Spheres", "Planes", "Cylinders", "Cones or other shapes"] },
      { id: "rt-light", type: "checkbox", question: "Which light effects?", options: ["Ambient light", "Hard shadows", "Shine (specular light)", "Several colored lights"] },
    ],
  },
  {
    slug: "netpractice",
    aliases: [],
    name: "NetPractice",
    about: "Exercises on making small networks work: IP addresses, subnet masks and routing.",
    techStack: "TCP/IP, Subnetting, Routing",
    questions: [
      {
        id: "np-topics",
        type: "checkbox",
        question: "What did you learn to do?",
        options: ["Work out subnet masks (CIDR)", "Tell private and public IPs apart", "Set up gateways and routes", "Fix networks with several routers"],
      },
    ],
  },
  {
    slug: "cpp-modules",
    aliases: ["cpp"],
    name: "C++ Modules",
    about: "A series of C++ exercises: classes, inheritance, polymorphism, exceptions, templates and the STL.",
    techStack: "C++98, OOP, STL",
    questions: [
      { id: "cpp-done", type: "checkbox", question: "Which modules did you finish?", options: ["CPP 00 to 04", "CPP 05 to 09"] },
      { id: "cpp-best", type: "text", question: "Which exercise are you most proud of?", placeholder: "e.g., the merge-insert sort in CPP09, or the RPN calculator" },
    ],
  },
  {
    slug: "inception",
    aliases: [],
    name: "Inception",
    about: "A small web setup with Docker: NGINX, WordPress and MariaDB, each in its own container.",
    techStack: "Docker, Docker Compose, NGINX, MariaDB, WordPress",
    questions: [
      {
        id: "inc-setup",
        type: "checkbox",
        question: "What did you set up?",
        options: ["HTTPS with TLS 1.2 or 1.3", "A private Docker network", "Volumes so data is kept", "My own images (no ready-made ones)"],
      },
      { id: "inc-bonus", type: "checkbox", question: "Bonus services?", options: ["Redis cache", "FTP server", "Static website", "Adminer"] },
    ],
  },
  {
    slug: "ft_irc",
    aliases: ["irc"],
    name: "ft_irc",
    about: "An IRC chat server in C++ that many clients can use at the same time.",
    techStack: "C++98, TCP sockets",
    questions: [
      { id: "irc-io", type: "radio", question: "Which function did you use to handle many clients?", options: ["poll()", "select()", "epoll()", "kqueue()"] },
      {
        id: "irc-features",
        type: "checkbox",
        question: "Which parts did you write?",
        options: ["Login (PASS, NICK, USER)", "Channels (JOIN, PART, PRIVMSG, TOPIC)", "Operator commands (KICK, INVITE, MODE)", "A bot", "File transfer"],
      },
    ],
  },
  {
    slug: "webserv",
    aliases: [],
    name: "webserv",
    about: "An HTTP web server in C++, like a small NGINX, with a config file and CGI.",
    techStack: "C++98, HTTP, Sockets",
    questions: [
      { id: "ws-io", type: "radio", question: "Which function did you use to handle many clients?", options: ["poll()", "select()", "epoll()", "kqueue()"] },
      {
        id: "ws-features",
        type: "checkbox",
        question: "Which parts did you write?",
        options: ["GET, POST and DELETE", "CGI (Python or PHP scripts)", "File uploads and chunked requests", "The config file parser", "Error pages and folder listings"],
      },
    ],
  },
  {
    slug: "ft_transcendence",
    aliases: ["transcendence"],
    name: "ft_transcendence",
    about: "A full web app built by a team: an online Pong game with accounts, chat and live matches.",
    techStack: "",
    questions: [
      { id: "ft-stack", type: "text", question: "Which tools did your team use?", placeholder: "e.g., Django, React, PostgreSQL, Docker" },
      {
        id: "ft-features",
        type: "checkbox",
        question: "Which parts did you build?",
        options: ["The live Pong game", "Login with 42 and two-factor login", "Chat", "Database and API", "Docker setup", "The design and pages"],
      },
    ],
  },
];

// Asked for every project.
export const COMMON_PROJECT_QUESTIONS: GuideQuestion[] = [
  { id: "team", type: "radio", question: "Did you work alone or in a team?", options: ["Alone", "With 1 other student", "In a team of 3 or more"] },
  { id: "own-part", type: "text", question: "What did you build yourself?", placeholder: "e.g., I wrote the parser and all the error messages" },
  { id: "hard-part", type: "text", question: "What was the hardest problem, and how did you fix it?", placeholder: "e.g., the program froze with many threads, so I changed the order of the locks" },
  { id: "numbers", type: "text", question: "Any numbers you are sure about? (optional)", placeholder: "e.g., 0 memory leaks, 500 numbers sorted in under 5,500 moves" },
];

// Questions for a project that is not in the list above.
export const OTHER_PROJECT_QUESTIONS: GuideQuestion[] = [
  { id: "about", type: "text", question: "What is the project, in one sentence?", placeholder: "e.g., a website where students swap old books" },
  { id: "features", type: "text", question: "What can it do?", placeholder: "e.g., search books, chat with the owner, get an email when a book is free" },
];

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

// Finds the guide for a 42 project from its Intra slug or its name. Returns undefined for other projects.
export function findProjectGuide(slug?: string, name?: string): ProjectGuide | undefined {
  const keys = [normalize(slug || ""), normalize(name || "")].filter(Boolean);
  if (keys.length === 0) return undefined;

  // C++ modules come as cpp-module-00 ... cpp-module-09 on the Intra.
  if (keys.some((k) => /^cpp(module)?s?\d*$/.test(k))) {
    return PROJECT_GUIDES.find((g) => g.slug === "cpp-modules");
  }

  for (const guide of PROJECT_GUIDES) {
    const names = [guide.slug, guide.name, ...guide.aliases].map(normalize);
    if (keys.some((k) => names.includes(k))) return guide;
  }

  // Loose match for slugs like "42cursus-minishell-v2". Only long names, so "ft" never matches "libft".
  for (const guide of PROJECT_GUIDES) {
    const main = normalize(guide.slug);
    if (main.length >= 5 && keys.some((k) => k.includes(main))) return guide;
  }
  return undefined;
}
