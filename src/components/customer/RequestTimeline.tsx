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

const ORDER_STEPS: TimelineStep[] = [
  {
    code: 'REQUESTED',
    label: 'Request Sent',
    description: 'Your pre-order has reached the shopkeeper',
  },
  {
    code: 'ACCEPTED',
    label: 'Shop Accepted',
    description: 'Shop confirmed item availability',
  },
  {
    code: 'PREPARING',
    label: 'Preparing Your Order',
    description: 'Shopkeeper is packing your items',
  },
  {
    code: 'READY',
    label: 'Ready for Pickup',
    description: 'Packed & ready for counter pickup or delivery',
  },
  {
    code: 'COMPLETED',
    label: 'Completed',
    description: 'Order handed over successfully',
  },
];

const APPOINTMENT_STEPS: TimelineStep[] = [
  {
    code: 'REQUESTED',
    label: 'Appointment Requested',
    description: 'Slot request sent to clinic / salon',
  },
  {
    code: 'CONFIRMED',
    label: 'Appointment Confirmed',
    description: 'Shopkeeper confirmed and reserved your slot',
  },
  {
    code: 'IN_PROGRESS',
    label: 'Appointment In Progress',
    description: 'Service / consultation is actively underway',
  },
  {
    code: 'COMPLETED',
    label: 'Completed',
    description: 'Appointment fulfilled successfully',
  },
];

const SERVICE_STEPS: TimelineStep[] = [
  {
    code: 'REQUESTED',
    label: 'Service Requested',
    description: 'Your service request has reached the shop',
  },
  {
    code: 'ACCEPTED',
    label: 'Service Accepted',
    description: 'Shop accepted request & confirmed estimated price',
  },
  {
    code: 'IN_PROGRESS',
    label: 'Service in Progress',
    description: 'Repair / tailoring work is actively underway',
  },
  {
    code: 'READY',
    label: 'Ready for Pickup',
    description: 'Work completed; ready for customer collection',
  },
  {
    code: 'COMPLETED',
    label: 'Completed',
    description: 'Handed over and payment settled',
  },
];

export const RequestTimeline: React.FC<RequestTimelineProps> = ({
  currentState,
  workflowGroupCode = 'ORDER',
  updatedAt,
}) => {
  const isTerminalFailure = ['REJECTED', 'EXPIRED', 'CANCELLED'].includes(currentState);
  const isDelayed = currentState === 'DELAYED';
  const isNoShow = currentState === 'NO_SHOW';

  const steps =
    workflowGroupCode === 'APPOINTMENT'
      ? APPOINTMENT_STEPS
      : workflowGroupCode === 'SERVICE'
      ? SERVICE_STEPS
      : ORDER_STEPS;

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
            <strong>Appointment / Service Delayed:</strong> The shopkeeper reported a delay. Please check notes for estimated timing.
          </div>
        </div>
      )}

      {/* Alert banner if in NO_SHOW state */}
      {isNoShow && (
        <div className="vaango-timeline-alert vaango-timeline-alert--error" role="status">
          <UserX size={20} />
          <div>
            <strong>Marked as No-Show:</strong> The customer did not arrive at the scheduled appointment time.
          </div>
        </div>
      )}

      {/* Alert banner if in terminal failure state */}
      {isTerminalFailure && (
        <div className="vaango-timeline-alert vaango-timeline-alert--error" role="status">
          {currentState === 'CANCELLED' ? <RotateCcw size={20} /> : <XCircle size={20} />}
          <div>
            <strong>Status: {currentState}</strong>
            <p>
              {currentState === 'CANCELLED'
                ? 'This request was cancelled.'
                : 'The shopkeeper was unable to accept this request at this time.'}
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
                      In Progress
                    </Badge>
                  )}
                  {stepStatus === 'completed' && (
                    <Badge variant="success" size="sm">
                      Done
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
