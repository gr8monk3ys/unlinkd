# Product Requirements Document (PRD)
## Personal Digital Disappearance and OSINT Self-Scan Service

## 1) Executive Summary
This PRD defines a privacy-first service that helps users:
1. Discover attributable public and semi-public digital exposure (accounts, identifiers, data broker presence, breached identifiers).
2. Execute legitimate removal and minimization workflows (account deletion/lockdown, broker opt-outs, de-indexing where applicable).
3. Rebuild a privacy-preserving digital presence based on compartmentalized identities (personas), hardened devices, and auditable infrastructure.

The product explicitly does **not** promise perfect anonymity. It aims for measurable reduction in exposure and linkability under bounded threat assumptions.

## 2) Core Design Tensions
### 2.1 Attribution elimination vs identity proof requirements
Many deletion workflows require identity verification. The product must minimize verification disclosure by generating least-privilege, user-controlled proof packages and isolating verification artifacts.

### 2.2 Privacy vs anonymity
VPNs and encrypted tools improve privacy but do not guarantee anonymity against capable correlating adversaries. Product language must remain explicit and bounded.

## 3) Objectives and Non-Goals
### 3.1 Objectives
- **Inventory completeness:** discover accounts, identifiers, broker entries, breaches, and high-risk linkages.
- **Removal efficacy:** produce verifiable reduction in exposed PII and reducible account surface.
- **Compartmentalized rebuild:** create separated personas with independent identifiers, credentials, and recovery factors.
- **Local-first auditability:** keep sensitive graph/evidence/credentials user-controlled and inspectable.

### 3.2 Non-Goals
- No support for fraud, impersonation, evasion of lawful process, harassment, or unauthorized OSINT.
- OSINT scope limited to user-supplied and user-controlled identifiers and legally permitted workflows.

## 4) Personas and Threat Models
### 4.1 Primary Personas
1. **Default user with broker exposure**: reduce profiling and spam/fraud risk.
2. **High-risk harassment/stalking target**: reduce discoverability and recovery abuse risk.
3. **Professional under corporate profiling**: reduce cross-context linkage.
4. **Technical privacy builder**: self-hosted, auditable, automation-heavy setup.

### 4.2 Adversaries
- Casual data brokers and downstream resellers.
- Corporate profiling and ad-tech ecosystems.
- Government-level observers (jurisdiction and capability dependent).
- Intimate adversaries/stalkers with contextual knowledge.

### 4.3 Threat Modeling Requirements
- Privacy analysis using LINDDUN-style categories.
- Security analysis for compromise and account takeover using modern control families and incident response practice.

## 5) Functional Requirements
The system is modular; each module can run independently but is strongest when orchestrated with recurring re-scan.

### 5.1 OSINT Self-Scan and Exposure Graph
- Ingest identifiers (name variants, addresses, phones, emails, usernames, domains, devices) with sensitivity and consent metadata.
- Use permitted sources/APIs for breach and exposure checks.
- Build a local linkage graph showing join keys (identifier reuse, device/browser linkage, recovery overlap).
- Risk-score findings by harm and exploitability with configurable threat tiers.

### 5.2 Account Discovery and Unused Account Detection
- Local mailbox parsing (welcome/reset/billing messages).
- Read-only password manager import correlation.
- Optional local app/browser login inventory.
- Configurable unused classifier (inactive age, breach status, 2FA posture, ownership confidence).

### 5.3 Account Removal and Data Minimization
- Connector state machine:
  - `discovered -> verified -> user-approved -> executed -> proof-captured -> recheck-scheduled`
- Deletion modes:
  - guided first-party workflows,
  - request templates,
  - lockdown fallback when deletion unavailable.
- Evidence capture in encrypted local vault (timestamps, artifacts, confirmation messages, content hashes).
- Jurisdiction-aware broker workflows and timeline handling.

### 5.4 Alias and Persona Management
- Persona namespace includes aliases, contact channels, naming conventions, device profile, vault partition, and communication tools.
- Alias rotation and kill switch.
- Policy engine blocks high-risk cross-persona reuse (recovery email/phone/username patterns).

### 5.5 Endpoint Provisioning and Hardening
- Declarative posture for desktop/mobile/server (encryption, updates, app controls).
- High-assurance options: VM isolation and hardened mobile profile options.

### 5.6 Private Infrastructure and Encrypted Storage
- Optional self-hosted private cloud and encrypted sync.
- OS-level and container-level encryption support.
- Clear separation between credential vault and operational evidence/log stores.

### 5.7 Authentication and Recovery
- Phishing-resistant MFA (passkeys/WebAuthn/hardware keys) prioritized.
- TOTP fallback for non-passkey services.
- Persona-specific recovery factor enforcement.

### 5.8 Network, Backup, and Incident Operations
- Segmented network baseline (trusted, pseudonymous, IoT/guest zones).
- VPN gateway for secure remote access.
- Encrypted, integrity-checked backups with routine restore tests.
- Monitoring and incident playbooks.

## 6) Non-Functional Requirements
### 6.1 Privacy and Unlinkability
- Local-first storage for graph/evidence/credentials.
- Minimize cross-persona join keys.
- Retention minimization with user-controlled archival.

### 6.2 Safety and Usability
- Guided workflows with consequence previews.
- Secure-by-default MFA and recovery checks.
- Explicit consent gates per action class.

### 6.3 Maintainability and Performance
- Connector isolation, versioning, and rapid update capability.
- Offline-capable core operations with graceful degradation for online checks.

### 6.4 Compliance Profile System
- Jurisdiction-specific policy profiles for rights and exceptions.
- Legal and ToS-aware automation boundaries.

## 7) Reference Architecture
### 7.1 Logical Components
- Local UI (desktop/web), optional mobile companion.
- Persona manager + policy engine.
- OSINT scan engine (self-scan only).
- Account discovery and removal orchestrator.
- Encrypted evidence vault and KPI/reporting.
- Optional self-hosted firewall/VPN/private cloud/backup/monitoring stack.
- Minimized external dependencies (breach APIs, broker endpoints, account providers).

### 7.2 Network Topology (Recommended)
- Firewall/router with VLAN segmentation.
- Distinct zones for admin/personal, pseudonymous, and untrusted IoT/guest.
- Home server and encrypted backup target behind policy controls.
- WireGuard-based remote access.

## 8) Risk Register and Mitigations
1. **Identity bleed across personas**
   - Mitigation: policy engine enforcement, explicit boundary warnings, separate profiles/devices.
2. **Metadata/correlation de-anonymization**
   - Mitigation: bounded claims, high-friction privacy modes, telemetry minimization.
3. **Legal variability by jurisdiction**
   - Mitigation: compliance profiles + explicit user approvals and proof minimization.
4. **Tool misuse risk**
   - Mitigation: self-scan-only scope controls and auditability.
5. **Self-hosting data loss risk**
   - Mitigation: mandatory backup setup and restore drills for critical components.

## 9) Validation and KPI Framework
### 9.1 Validation Program
- Baseline scan -> remediation -> re-scan at 30/90/180 days.
- Verify account deletion/lockdown outcomes with evidence artifacts.
- Conduct privacy and security audits against control baselines.

### 9.2 KPIs
- Account coverage rate.
- Broker exposure count and trend.
- Deletion success rate and mean remediation time.
- MFA posture score (phishing-resistant vs weaker factors).
- Cross-persona join key violations (target toward zero).
- Backup restore success rate and time-to-restore.
- Patch latency to configured SLA.

## 10) Phased Delivery Plan (Indicative)
1. **Foundation (6-12 weeks):** local-first UI, persona model, encrypted evidence vault, mailbox inventory.
2. **OSINT Scan (8-16 weeks):** breach checks, exposure graph, risk scoring.
3. **Removal Orchestration (12-24 weeks):** connectors, evidence capture, recheck scheduler.
4. **Security Stack (10-20 weeks):** vault integration, MFA posture, backups, monitoring, IR runbooks.
5. **Private Infra (12-24+ weeks):** segmentation, VPN, private cloud, optional local AI.

## 11) Operations and SOPs
- **Weekly:** updates, queue review, alert review.
- **Monthly:** exposure and breach recheck, alias rotation, persona boundary audit.
- **Quarterly:** recovery drills, key/recovery validation, incident tabletop.

Incident workflows should cover preparation, detection, containment, eradication, recovery, and post-incident learning.

## 12) Additional Recommended Enhancements
- Anti-fingerprinting browser defaults.
- Clear DNS privacy trust-model documentation.
- Isolation-heavy workflows for high-risk personas.
- Programmatic migration plan toward phishing-resistant MFA across critical accounts.
