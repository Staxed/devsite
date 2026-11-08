export const BASE_URL = process.env.NEXTAUTH_URL!;

// Auth (must be env — needed before DB is reachable during auth bootstrap)
export const ADMIN_WALLET_ADDRESS = process.env.ADMIN_WALLET_ADDRESS!;

// Branch ignore patterns
export const BRANCH_IGNORE_PATTERNS = ["dependabot/", "renovate/"];
