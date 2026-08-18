import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "npm:@aws-sdk/client-s3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner";

function client() { return new S3Client({ region: "auto", endpoint: Deno.env.get("R2_ENDPOINT")!, credentials: { accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!, secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")! } }); }
const bucket = () => Deno.env.get("R2_BUCKET_NAME")!;
export function objectKey(mediaId: string, filename: string) { const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180) || "file"; return `originals/${mediaId}/${safeName}`; }
export function signedUploadUrl(key: string, contentType: string) { return getSignedUrl(client(), new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }), { expiresIn: 600 }); }
export function signedDownloadUrl(key: string) { return getSignedUrl(client(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn: 300 }); }
export function headObject(key: string) { return client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key })); }
