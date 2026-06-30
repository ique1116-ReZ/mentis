export type ActorRole = "user" | "clinician" | "organization" | "admin";
export interface PlatformActor {
    id: string;
    role: ActorRole;
    displayName: string;
}
export interface User extends PlatformActor {
    role: "user";
}
export interface Clinician extends PlatformActor {
    role: "clinician";
    credentialStatus: "pending" | "verified" | "rejected";
    specialties: string[];
}
export interface Organization extends PlatformActor {
    role: "organization";
    memberClinicianIds: string[];
}
export type ConditionFocus = "acl_reconstruction" | "meniscus" | "patellofemoral_pain" | "achilles_tendinopathy" | "ankle_sprain" | "running_knee_pain";
export interface Assessment {
    bodyRegion: "knee" | "ankle_foot" | "hip" | "spine" | "shoulder" | "other";
    conditionFocus: ConditionFocus;
    painScore: number;
    durationDays: number;
    symptoms: string[];
    trainingLoad: string;
    createdAt: string;
}
export type TriageLevel = "urgent_referral" | "clinician_review_recommended" | "self_management_with_review_option";
export interface TriageResult {
    level: TriageLevel;
    matchedRedFlags: string[];
    allowedAiActions: Array<"education" | "rehab_draft" | "prepare_clinician_summary">;
    message: string;
}
export interface RehabStage {
    name: string;
    window: string;
    goals: string[];
    homework: string[];
}
export interface RehabPlan {
    title: string;
    disclaimer: string;
    redFlagGate: "clear" | "blocked";
    stages: RehabStage[];
    progressionCriteria: string[];
}
export interface TimelineEvent {
    id: string;
    type: "assessment" | "upload" | "ai_draft" | "expert_review" | "homework" | "follow_up";
    title: string;
    createdAt: string;
}
export interface CaseRecord {
    id: string;
    ownerUserId: string;
    authorizedClinicianIds: string[];
    authorizedOrganizationIds: string[];
    conditionFocus: ConditionFocus;
    timeline: TimelineEvent[];
}
export type EvidenceType = "clinical_practice_guideline" | "consensus_statement" | "systematic_review" | "textbook" | "narrative_review" | "protocol_or_presentation" | "other";
export interface EvidenceCitation {
    source: string;
    page?: number;
    evidenceType: EvidenceType;
    quote?: string;
    score: number;
}
export interface EvidenceSummary {
    primaryCitation: string;
    citations: Array<EvidenceCitation & {
        label: string;
        evidenceRank: number;
    }>;
    conflictPolicy: string;
}
export interface AuditEvent {
    id: string;
    actorId: string;
    actorRole: ActorRole;
    caseId: string;
    action: "assessment_submitted" | "ai_rehab_draft_created" | "urgent_referral_triggered" | "expert_review_submitted" | "case_accessed" | "authorization_changed";
    sensitiveDataCategory: "medical_health";
    metadata: Record<string, unknown>;
    createdAt: string;
}
export declare function buildInitialAssessment(input: Omit<Assessment, "createdAt">): Assessment;
export declare function assessRedFlags(assessment: Assessment): TriageResult;
export declare function draftKneeRunningPlan(assessment: Assessment): RehabPlan;
export declare function canAccessCase(actor: PlatformActor, record: CaseRecord): boolean;
export declare function createAuditEvent(input: Omit<AuditEvent, "id" | "sensitiveDataCategory" | "createdAt">): AuditEvent;
export declare function summarizeEvidence(citations: EvidenceCitation[]): EvidenceSummary;
