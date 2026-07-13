export function exactVersionDeleteInput(bucket, key, versionId = '') {
  const input = { Bucket: bucket, Key: key };
  if (versionId !== undefined && versionId !== null && String(versionId) !== '') {
    input.VersionId = String(versionId);
  }
  return input;
}
