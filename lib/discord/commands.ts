export const COMMANDS = [
  {
    name: "log",
    description: "Log a manual activity",
    options: [
      {
        name: "category",
        description: "Activity category (e.g. fitness, reading, learning)",
        type: 3, // STRING
        required: true,
      },
      {
        name: "value",
        description: "Numeric value",
        type: 10, // NUMBER
        required: true,
      },
      {
        name: "unit",
        description: "Unit of measurement (e.g. minutes, pages, count)",
        type: 3,
        required: true,
      },
      {
        name: "note",
        description: "Optional note or title",
        type: 3,
        required: false,
      },
    ],
  },
  {
    name: "habit",
    description: "Track a habit",
    options: [
      {
        name: "done",
        description: "Mark a habit as done",
        type: 1, // SUB_COMMAND
        options: [
          {
            name: "name",
            description: "Habit name",
            type: 3,
            required: true,
          },
          {
            name: "value",
            description: "Value (defaults to 1)",
            type: 10,
            required: false,
          },
        ],
      },
    ],
  },
  {
    name: "stats",
    description: "View activity stats",
    options: [
      {
        name: "period",
        description: "Time period",
        type: 3,
        required: true,
        choices: [
          { name: "Today", value: "day" },
          { name: "This Week", value: "week" },
          { name: "This Month", value: "month" },
          { name: "This Year", value: "year" },
        ],
      },
    ],
  },
  {
    name: "activity",
    description: "GitHub activity commands",
    options: [
      {
        name: "stats",
        description: "View detailed activity stats with breakdown",
        type: 1, // SUB_COMMAND
        options: [
          {
            name: "timeframe",
            description: "Time period",
            type: 3,
            required: false,
            choices: [
              { name: "Today", value: "day" },
              { name: "This Week", value: "week" },
              { name: "This Month", value: "month" },
              { name: "This Year", value: "year" },
            ],
          },
        ],
      },
      {
        name: "streak",
        description: "View current and longest coding streak",
        type: 1,
      },
      {
        name: "repos",
        description: "View per-repo activity breakdown",
        type: 1,
        options: [
          {
            name: "timeframe",
            description: "Time period",
            type: 3,
            required: false,
            choices: [
              { name: "Today", value: "day" },
              { name: "This Week", value: "week" },
              { name: "This Month", value: "month" },
              { name: "This Year", value: "year" },
            ],
          },
        ],
      },
      {
        name: "insights",
        description: "View time-of-day and day-of-week patterns",
        type: 1,
      },
      {
        name: "badges",
        description: "View earned achievements",
        type: 1,
      },
    ],
  },
];
