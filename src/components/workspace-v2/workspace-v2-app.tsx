'use client';

import { useCallback, useContext, useState } from 'react';
import { ChatWorkspace } from '@/components/chats/chat-workspace';
import { AnalyticsTab } from '@/components/prompt-refinery/analytics-tab';
import { ConverterTab } from '@/components/prompt-refinery/converter-tab';
import { EvaluatorTab } from '@/components/prompt-refinery/evaluator-tab';
import { SavedPromptsTab } from '@/components/prompt-refinery/saved-prompts-tab';
import { SharedTab } from '@/components/prompt-refinery/shared-tab';
import { SubscriptionContext } from '@/context/subscription-context';
import { WorkspaceShell, type WorkspaceDestination } from './workspace-shell';

export function WorkspaceV2App() {
  const subscription = useContext(SubscriptionContext);
  const [destination, setDestination] = useState<WorkspaceDestination>('refinery');
  const showChat = ['refinery', 'history', 'library'].includes(destination);
  const changeChatView = useCallback((view: 'refinery' | 'history' | 'library') => setDestination(view), []);
  return <WorkspaceShell activeDestination={destination} onDestinationChange={setDestination}
    isPro={subscription.isPro} planLabel={subscription.planLabel}
    savedPromptCount={subscription.savedPromptCount} savedPromptLimit={subscription.savedPromptLimit}
    dailyUnits={subscription.freeAllowance?.refinement.daily.remaining ?? null}
    monthlyUnits={subscription.freeAllowance?.refinement.monthly.remaining ?? null}
    availableCredits={subscription.availableCredits} reservedCredits={subscription.reservedCredits}>
    <div hidden={!showChat}><ChatWorkspace view={destination === 'history' || destination === 'library' ? destination : 'refinery'} onView={changeChatView} /></div>
    {destination === 'evaluator' && <EvaluatorTab />}
    {destination === 'converter' && <ConverterTab projects={null} selectedProject={null} />}
    {destination === 'saved' && <SavedPromptsTab />}
    {destination === 'analytics' && subscription.isPro && <AnalyticsTab variant="workspace-v2" />}
    {destination === 'shared' && subscription.isPro && <SharedTab />}
  </WorkspaceShell>;
}
