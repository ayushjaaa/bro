import 'server-only';
import { shopifyAdminRequest, assertNoUserErrors } from './admin-client';

interface StagedUploadsCreateResponse {
  stagedUploadsCreate: {
    stagedTargets: Array<{
      url: string;
      resourceUrl: string;
      parameters: Array<{ name: string; value: string }>;
    }>;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
}

const STAGED_UPLOADS_CREATE_MUTATION = /* GraphQL */ `
  mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters {
          name
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

interface FileCreateResponse {
  fileCreate: {
    files: Array<{ id: string; fileStatus: string }>;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
}

const FILE_CREATE_MUTATION = /* GraphQL */ `
  mutation FileCreate($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files {
        id
        fileStatus
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/** Stages an image with Shopify and uploads the bytes, returning the staged resourceUrl. */
async function stageAndUpload(file: File): Promise<string> {
  const stagedData = await shopifyAdminRequest<StagedUploadsCreateResponse>(
    STAGED_UPLOADS_CREATE_MUTATION,
    {
      input: [{ filename: file.name, mimeType: file.type, httpMethod: 'POST', resource: 'IMAGE' }],
    }
  );
  assertNoUserErrors(stagedData.stagedUploadsCreate.userErrors, 'stagedUploadsCreate');
  const target = stagedData.stagedUploadsCreate.stagedTargets[0];

  const uploadForm = new FormData();
  for (const param of target.parameters) {
    uploadForm.append(param.name, param.value);
  }
  uploadForm.append('file', file);
  const uploadResponse = await fetch(target.url, { method: 'POST', body: uploadForm });
  if (!uploadResponse.ok) {
    throw new Error(`Staged upload failed: ${uploadResponse.status}`);
  }

  return target.resourceUrl;
}

/** Stages, uploads, and registers an image file with Shopify, returning a File GID usable as a
 * file_reference field/metafield value (e.g. Category/Sub-category image, Brand logo). */
export async function uploadImageFile(file: File): Promise<string> {
  const resourceUrl = await stageAndUpload(file);
  const fileData = await shopifyAdminRequest<FileCreateResponse>(FILE_CREATE_MUTATION, {
    files: [{ originalSource: resourceUrl, contentType: 'IMAGE' }],
  });
  assertNoUserErrors(fileData.fileCreate.userErrors, 'fileCreate');
  return fileData.fileCreate.files[0].id;
}

/** Stages and uploads an image, returning the staged resourceUrl -- what productCreate's `media`
 * input wants (`originalSource`), as opposed to the File GID `uploadImageFile` returns. */
export async function uploadImageForProductMedia(file: File): Promise<string> {
  return stageAndUpload(file);
}
