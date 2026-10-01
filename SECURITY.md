# Security Policy

The **Seira** project takes the security of its compiler, runtime, and ecosystem seriously.

---

## 1. Supported Releases

Only the latest active release series receives security patches:

| Version Series | Supported |
| :--- | :--- |
| `0.0.10-s` (Seed Series) | :white_check_mark: |
| Pre-release / Development | :x: |

---

## 2. Reporting a Vulnerability

If you discover a security vulnerability or potential exploit within Seira:

1. **Do NOT open a public GitHub issue.** Public disclosure exposes users before a remediation is available.
2. **Submit via GitHub Private Vulnerability Reporting**:
   - Navigate to the repository's **Security** tab.
   - Click on **Advisories** -> **Report a vulnerability**.
3. **Alternative Contact**:
   - If GitHub Private Vulnerability Reporting is unavailable, reach out directly to the repository maintainer through the GitHub profile contact details (see project maintainers listed in [GOVERNANCE.md](GOVERNANCE.md)).

### What to Include:
- A clear description of the vulnerability.
- Steps to reproduce or a minimal reproducible code snippet (`.sr` or build command).
- Impact assessment (e.g., denial of service, memory corruption, arbitrary code execution during compilation).
- Potential mitigations, if known.

---

## 3. Response Process

1. **Acknowledgment**: The maintainers will acknowledge receipt within 48 hours.
2. **Assessment**: The vulnerability will be verified and impact evaluated.
3. **Patch Development**: A fix will be developed in a private security branch.
4. **Coordinated Disclosure**: A security advisory and patched release will be published simultaneously.

---

## 4. Security Principles

Seira follows strict security-by-design principles:
- **Dependency Awareness**: Minimal external dependencies; automated vulnerability auditing.
- **No Hidden Execution**: The compiler will never execute arbitrary host commands during parsing or building without explicit, sandboxed flags.
- **Memory Safety**: Type safety and deterministic resource cleanup mitigate common memory vulnerabilities.
- **Safe Tooling**: The CLI enforces validation and prevents path traversal and credential leakage.
