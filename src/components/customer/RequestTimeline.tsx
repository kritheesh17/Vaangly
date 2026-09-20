import React from 'react';
import { WorkflowStateCode, WorkflowGroupCode } from '../../types/workflow';
import {
  CheckCircle2,
  Clock,
  Package,
  ShoppingBag,
  CheckCheck,
  AlertTriangle,
  XCircle,
  RotateCcw,
  CalendarCheck,
  UserCheck,
  Wrench,
  UserX,
} from 'lucide-react';
import { Badge } from '../ui/Badge';
import { useLanguage } from '../../context/LanguageContext';
import './RequestTimeline.css';

export interface RequestTimelineProps {
  currentState: WorkflowStateCode;
  workflowGroupCode?: WorkflowGroupCode;
  updatedAt?: string;
  isDelayed?: boolean;
}

interface TimelineStep {
  code: WorkflowStateCode;
  label: string;
  description: string;
}

export const RequestTimeline: React.FC<RequestTimelineProps> = ({
  currentState,
  workflowGroupCode = 'ORDER',
  updatedAt,
}) => {
  const { t } = useLanguage();
  const isTerminalFailure = ['REJECTED', 'EXPIRED', 'CANCELLED'].includes(currentState);
  const isDelayed = currentState === 'DELAYED';
  const isNoShow = currentState === 'NO_SHOW';

  const orderSteps: TimelineStep[] = [
    {
      code: 'REQUESTED',
      label: t('timelineStepOrderRequestedLabel'),
      description: t('timelineStepOrderRequestedDesc'),
    },
    {
      code: 'ACCEPTED',
      label: t('timelineStepOrderAcceptedLabel'),
      description: t('timelineStepOrderAcceptedDesc'),
    },
    {
      code: 'PREPARING',
      label: t('timelineStepOrderPreparingLabel'),
      description: t('timelineStepOrderPreparingDesc'),
    },
    {
      code: 'READY',
      label: t('timelineStepOrderReadyLabel'),
      description: t('timelineStepOrderReadyDesc'),
    },
    {
      code: 'COMPLETED',
      label: t('timelineStepOrderCompletedLabel'),
      description: t('timelineStepOrderCompletedDesc'),
    },
  ];

  const appointmentSteps: TimelineStep[] = [
    {
      code: 'REQUESTED',
      label: t('timelineStepAptRequestedLabel'),
      description: t('timelineStepAptRequestedDesc'),
    },
    {
      code: 'CONFIRMED',
      label: t('timelineStepAptConfirmedLabel'),
      description: t('timelineStepAptConfirmedDesc'),
    },
    {
      code: 'IN_PROGRESS',
      label: t('timelineStepAptInProgressLabel'),
      description: t('timelineStepAptInProgressDesc'),
    },
    {
      code: 'COMPLETED',
      label: t('timelineStepAptCompletedLabel'),
      description: t('timelineStepAptCompletedDesc'),
    },
  ];

  const serviceSteps: TimelineStep[] = [
    {
      code: 'REQUESTED',
      label: t('timelineStepSrvRequestedLabel'),
      description: t('timelineStepSrvRequestedDesc'),
    },
    {
      code: 'ACCEPTED',
      label: t('timelineStepSrvAcceptedLabel'),
      description: t('timelineStepSrvAcceptedDesc'),
    },
    {
      code: 'IN_PROGRESS',
      label: t('timelineStepSrvInProgressLabel'),
      description: t('timelineStepSrvInProgressDesc'),
    },
    {
      code: 'READY',
      label: t('timelineStepSrvReadyLabel'),
      description: t('timelineStepSrvReadyDesc'),
    },
    {
      code: 'COMPLETED',
      label: t('timelineStepSrvCompletedLabel'),
      description: t('timelineStepSrvCompletedDesc'),
    },
  ];

  const steps =
    workflowGroupCode === 'APPOINTMENT'
      ? appointmentSteps
      : workflowGroupCode === 'SERVICE'
      ? serviceSteps
      : orderSteps;

  const getStepIndex = (code: WorkflowStateCode): number => {
    return steps.findIndex((s) => s.code === code);
  };

  const currentIndex = getStepIndex(currentState);

  const renderIcon = (status: 'completed' | 'active' | 'pending', stepCode: WorkflowStateCode) => {
    if (status === 'completed') {
      return <CheckCircle2 size={20} className="vaango-step-icon vaango-step-icon--done" />;
    }
    if (status === 'active') {
      switch (stepCode) {
        case 'REQUESTED':
          return <Clock size={20} className="vaango-step-icon vaango-step-icon--active" />;
        case 'CONFIRMED':
          return <CalendarCheck size={20} className="vaango-step-icon vaango-step-icon--active" />;
        case 'ACCEPTED':
          return <CheckCircle2 size={20} className="vaango-step-icon vaango-step-icon--active" />;
        case 'PREPARING':
          return <Package size={20} className="vaango-step-icon vaango-step-icon--active" />;
        case 'IN_PROGRESS':
          return workflowGroupCode === 'APPOINTMENT' ? (
            <UserCheck size={20} className="vaango-step-icon vaango-step-icon--active" />
          ) : (
            <Wrench size={20} className="vaango-step-icon vaango-step-icon--active" />
          );
        case 'READY':
          return <ShoppingBag size={20} className="vaango-step-icon vaango-step-icon--active" />;
        case 'COMPLETED':
          return <CheckCheck size={20} className="vaango-step-icon vaango-step-icon--active" />;
        default:
          return <Clock size={20} className="vaango-step-icon vaango-step-icon--active" />;
      }
    }
    return <span className="vaango-step-icon-dot" />;
  };

  return (
    <div className="vaango-timeline-wrap" aria-label="Request lifecycle tracking timeline">
      {/* Alert banner if in DELAYED state */}
      {isDelayed && (
        <div className="vaango-timeline-alert vaango-timeline-alert--warning" role="status">
          <AlertTriangle size={20} />
          <div>
            <strong>{t('timelineDelayedTitle')}</strong> {t('timelineDelayedText')}
          </div>
        </div>
      )}

      {/* Alert banner if in NO_SHOW state */}
      {isNoShow && (
        <div className="vaango-timeline-alert vaango-timeline-alert--error" role="status">
          <UserX size={20} />
          <div>
            <strong>{t('timelineNoShowTitle')}</strong> {t('timelineNoShowText')}
          </div>
        </div>
      )}

      {/* Alert banner if in terminal failure state */}
      {isTerminalFailure && (
        <div className="vaango-timeline-alert vaango-timeline-alert--error" role="status">
          {currentState === 'CANCELLED' ? <RotateCcw size={20} /> : <XCircle size={20} />}
          <div>
            <strong>{currentState === 'CANCELLED' ? t('timelineCancelledTitle') : `Status: ${currentState}`}</strong>
            <p>
              {currentState === 'CANCELLED'
                ? t('timelineCancelledText')
                : t('timelineRejectedText')}
            </p>
          </div>
        </div>
      )}

      {/* Main Stepper */}
      <ol className="vaango-timeline-list">
        {steps.map((step, index) => {
          let stepStatus: 'completed' | 'active' | 'pending' = 'pending';

          if (!isTerminalFailure && !isNoShow) {
            if (index < currentIndex || currentState === 'COMPLETED') {
              stepStatus = 'completed';
            } else if (index === currentIndex) {
              stepStatus = 'active';
            }
          } else {
            stepStatus = index === 0 ? 'completed' : 'pending';
          }

          return (
            <li
              key={step.code}
              className={`vaango-timeline-step vaango-timeline-step--${stepStatus}`}
            >
              <div className="vaango-timeline-connector">
                <div className="vaango-timeline-icon-wrap" aria-hidden="true">
                  {renderIcon(stepStatus, step.code)}
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`vaango-timeline-line ${
                      stepStatus === 'completed' ? 'vaango-timeline-line--completed' : ''
                    }`}
                  />
                )}
              </div>

              <div className="vaango-timeline-content">
                <div className="vaango-timeline-label-row">
                  <span className="vaango-timeline-label">{step.label}</span>
                  {stepStatus === 'active' && (
                    <Badge variant="primary" size="sm" withDot>
                      {t('timelineStepInProgress')}
                    </Badge>
                  )}
                  {stepStatus === 'completed' && (
                    <Badge variant="success" size="sm">
                      {t('timelineStepDone')}
                    </Badge>
                  )}
                </div>
                <p className="vaango-timeline-desc">{step.description}</p>
                {stepStatus === 'active' && updatedAt && (
                  <span className="vaango-timeline-time">
                    Updated {new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
};
