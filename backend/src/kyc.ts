/** Future provider boundary. No documents, images, ID numbers or uploads accepted. */
export type IdentityKind = 'emirates_id' | 'passport';
export interface VerificationCapability {
  available: false;
  documentsAccepted: false;
  supportedFutureKinds: readonly IdentityKind[];
}
export const verification: VerificationCapability = Object.freeze({
  available: false, documentsAccepted: false,
  supportedFutureKinds: ['emirates_id', 'passport'] as const
});
