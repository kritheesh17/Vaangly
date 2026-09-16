// Workflow Group & State Machine Definitions

export type WorkflowGroupCode = 'ORDER' | 'APPOINTMENT' | 'SERVICE';

export type WorkflowStateCode =
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'READY'
  | 'COMPLETED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'DELAYED'
  | 'NO_SHOW';

export interface WorkflowGroup {
  id: string;
  code: WorkflowGroupCode;
  name: string;
  description: string;
  icon: string;
  created_at: string;
}

export interface WorkflowState {
  id: string;
  group_id: string;
  code: WorkflowStateCode;
  label: string;
  is_initial: boolean;
  is_terminal: boolean;
  color_badge: string;
}

export interface WorkflowTransition {
  id: string;
  group_id: string;
  from_state_id: string;
  to_state_id: string;
  allowed_actor_roles: ('customer' | 'shopkeeper' | 'admin')[];
  action_label: string;
}

// Built-in Workflow Groups metadata for frontend visualization & validation
export const WORKFLOW_GROUPS: Record<
  WorkflowGroupCode,
  {
    code: WorkflowGroupCode;
    title: string;
    description: string;
    examples: string[];
    happyPath: WorkflowStateCode[];
    branchStates: WorkflowStateCode[];
  }
> = {
  ORDER: {
    code: 'ORDER',
    title: 'Order-Based',
    description: 'Pre-order daily essentials and goods without waiting in queues',
    examples: ['Grocery', 'Bakery', 'Restaurant/Hotel', 'Pharmacy', 'Stationery'],
    happyPath: ['REQUESTED', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED'],
    branchStates: ['REJECTED', 'EXPIRED', 'CANCELLED', 'DELAYED'],
  },
  APPOINTMENT: {
    code: 'APPOINTMENT',
    title: 'Appointment-Based',
    description: 'Reserve designated time slots for dedicated personal care or consultations',
    examples: ['Salon', 'Hospital/Clinic'],
    happyPath: ['REQUESTED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'],
    branchStates: ['REJECTED', 'EXPIRED', 'CANCELLED', 'DELAYED', 'NO_SHOW'],
  },
  SERVICE: {
    code: 'SERVICE',
    title: 'Service-Based',
    description: 'Request skilled hands-on repairs, custom tailoring, and maintenance',
    examples: ['Tailor', 'Mechanic', 'Mobile/Electronics Repair', 'Laundry'],
    happyPath: ['REQUESTED', 'ACCEPTED', 'IN_PROGRESS', 'READY', 'COMPLETED'],
    branchStates: ['REJECTED', 'EXPIRED', 'CANCELLED', 'DELAYED'],
  },
};
