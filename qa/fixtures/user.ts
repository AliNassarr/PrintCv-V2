// Fictional test user for local checks. No real person, no real campus.
export const proj = (id: number, name: string, slug: string, d: string) => ({ id, name, slug, finalMark: 100, validated: true, markedAt: d });
export const testUser: any = {
  id: 1, login: "sstud", email: "sample.student@example.org", displayname: "Sam Student", image: "",
  campusName: "Sample campus", campusId: 1, level: 7.2, grade: "Learner", poolMonth: "", poolYear: 2024, coalition: "",
  beginAt: "2024-10-01T00:00:00Z",
  validatedProjects: [
    proj(1, "webserv", "webserv", "2025-06-01"), proj(2, "minishell", "minishell", "2025-03-01"),
    proj(3, "philosophers", "philosophers", "2025-01-01"), proj(4, "push_swap", "push_swap", "2024-12-01"),
    proj(5, "so_long", "so_long", "2024-11-20"), proj(6, "libft", "libft", "2024-11-01"),
    proj(7, "Exam Rank 02", "exam-rank-02", "2024-11-01"),
  ],
};
export const TEST_PHONE = "+1 555 0100";
