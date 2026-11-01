// Lines written for the made-up students on the landing page. Strings only.
// The editor flags these if a student pastes them, so every real CV stays unique.
export const SAMPLE_LINES = {
  noa: {
    minishell: [
      "Wrote the quote and dollar-sign expansion for a two-person shell, checked against 140 Bash test cases.",
      "Traced 9 file descriptor leaks in pipelines with Valgrind and closed each one in the child process.",
      "Split the parser and the executor into separate modules so both teammates could work at the same time.",
    ],
    philosophers: [
      "Timed each meal with microsecond checks and kept the death report under 10 ms late at 200 threads.",
      "Reordered fork pickup for odd and even seats, which removed every deadlock in 50 test runs.",
      "Measured CPU use with and without short sleeps, then settled on 500 microsecond pauses.",
    ],
  },
  kiran: {
    webserv: [
      "Built the request parser for a three-person HTTP server and passed 60 of 60 evaluation tests.",
      "Added chunked upload support that stores files of up to 50 MB without blocking other clients.",
      "Ran siege against the server at 300 parallel connections and patched 4 crashes in the response code.",
    ],
    cub3d: [
      "Coded the ray casting loop in C and kept the frame rate above 60 on a school iMac.",
      "Checked every map for open walls with a flood fill before the first frame is drawn.",
      "Mapped wall textures from 4 image files to the north, south, east and west sides.",
    ],
  },
  mara: {
    ft_transcendence: [
      "Designed the live game sync for an online Pong site, holding two players in step at 60 updates a second.",
      "Connected sign-in with a one-time code app, used by all 5 teammates during the final evaluation.",
      "Reviewed 38 pull requests from teammates and wrote the setup guide the team used to start the project.",
    ],
    inception: [
      "Packed a web server, a database and a blog engine into 3 containers that start with one command.",
      "Locked the web server to TLS 1.3 and kept the database off the public network.",
      "Moved site data to named volumes, so a full rebuild kept every post and user account.",
    ],
  },
  ines: {
    ft_irc: [
      "Built an IRC server in C++ with a partner and got 3 real IRC clients chatting on it.",
      "Handled up to 150 clients at once with a single poll() loop.",
      "Tested channel commands like JOIN, KICK and MODE by hand and with a small Python script.",
    ],
    miniRT: [
      "Wrote a ray tracer in C for spheres, planes and cylinders, with one light and the shadows it casts.",
      "Fixed a shadow bug on curved shapes after going through 20 scene files one by one.",
      "Checked each scene file for mistakes and printed the line number of the first one.",
    ],
    push_swap: [
      "Brought the move count for 500 numbers under 5,500 with 2 stacks, by always moving the cheapest number next.",
      "Counted the moves on 1,000 random lists with a shell script before keeping any change.",
    ],
    repairs: [
      "Repaired about 15 phones and laptops a week, mostly screens, batteries and charging ports.",
      "Set up a shared spreadsheet for parts, so the shop stopped ordering the same part twice.",
      "Explained each repair to customers in plain words and gave a written price before starting.",
    ],
    piscine: [
      "Answered questions from about 40 Piscine students at evening help sessions for 4 weeks.",
      "Showed new students how Git works and how to read compiler errors.",
    ],
  },
} as const;

export const ALL_SAMPLE_LINES: string[] = Object.values(SAMPLE_LINES).flatMap((s) => Object.values(s).flatMap((l) => [...l]));
