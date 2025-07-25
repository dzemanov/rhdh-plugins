/*
 * Copyright Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { createApiRef } from '@backstage/core-plugin-api';

import OpenAI from 'openai';

import {
  Attachment,
  BaseMessage,
  CaptureFeedback,
  ConversationList,
} from '../types';

export type LightspeedAPI = {
  getAllModels: () => Promise<OpenAI.Models.Model[]>;
  getConversationMessages: (conversation_id: string) => Promise<BaseMessage[]>;
  createMessage: (
    prompt: string,
    selectedModel: string,
    conversation_id: string,
    attachments: Attachment[],
  ) => Promise<ReadableStreamDefaultReader>;
  deleteConversation: (
    conversation_id: string,
  ) => Promise<{ success: boolean }>;
  getConversations: () => Promise<ConversationList>;
  getFeedbackStatus: () => Promise<boolean>;
  captureFeedback: (payload: CaptureFeedback) => Promise<{ response: string }>;
};

export const lightspeedApiRef = createApiRef<LightspeedAPI>({
  id: 'plugin.lightspeed.service',
});
