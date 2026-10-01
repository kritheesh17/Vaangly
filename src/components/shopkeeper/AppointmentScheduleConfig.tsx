import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  Plus,
  Trash2,
  Copy,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Sparkles,
  Users,
  Layers,
  RotateCcw,
} from 'lucide-react';
import { SlotConfig, CustomSlotDefinition } from '../../types/database';
import { Button } from '../ui/Button';
import { TimePicker12h } from '../ui/TimePicker12h';
import { useToast } from '../../context/ToastContext';
import {
  parseTimeToMinutes,
  minutesToFormattedTime,
  getSlotDurationMinutes,
  calculateEndTimeFromDuration,
  validateFlexibleSlotsConfig,
  generateDefaultFlexibleSlots,
  FlexibleSlotInput,
  WorkingPeriodInput,
} from '../../lib/appointmentValidation';
import { updateSlotConfig } from '../../lib/shopkeeperApi';
import { generateAndSyncAppointmentSlots } from '../../lib/appointmentServiceApi';
import './AppointmentScheduleConfig.css';

export interface AppointmentScheduleConfigProps {
  shopId: string;
  initialConfig?: SlotConfig | null;
  onSave?: (savedConfig: SlotConfig) => void;
  serviceId?: string | null;
  readOnly?: boolean;
}

const DAY_OPTIONS = [
  { dayIndex: 1, label: 'Mon', full: 'Monday' },
  { dayIndex: 2, label: 'Tue', full: 'Tuesday' },
  { dayIndex: 3, label: 'Wed', full: 'Wednesday' },
  { dayIndex: 4, label: 'Thu', full: 'Thursday' },
  { dayIndex: 5, label: 'Fri', full: 'Friday' },
  { dayIndex: 6, label: 'Sat', full: 'Saturday' },
  { dayIndex: 0, label: 'Sun', full: 'Sunday' },
];

export const AppointmentScheduleConfig: React.FC<AppointmentScheduleConfigProps> = ({
  shopId,
  initialConfig,
  onSave,
  serviceId,
  readOnly = false,
}) => {
  const { success, error: toastError } = useToast();

  // 1. Working Hours State
  const [workingPeriods, setWorkingPeriods] = useState<WorkingPeriodInput[]>(() => {
    if (initialConfig?.workingHours && initialConfig.workingHours.length > 0) {
      return initialConfig.workingHours.map((wh, idx) => ({
        id: `wp-${idx + 1}`,
        start: wh.start,
        end: wh.end,
      }));
    }
    if (initialConfig?.ranges && initialConfig.ranges.length > 0) {
      return initialConfig.ranges.map((r, idx) => ({
        id: r.id || `wp-${idx + 1}`,
        start: r.start,
        end: r.end,
      }));
    }
    return [{ id: 'wp-1', start: '09:00', end: '12:00' }];
  });

  // 2. Active Days State (Default Mon-Sat)
  const [availableDays, setAvailableDays] = useState<number[]>(() => {
    return initialConfig?.availableDays && initialConfig.availableDays.length > 0
      ? initialConfig.availableDays
      : [1, 2, 3, 4, 5, 6];
  });

  // 3. Flexible Custom Slots State
  const [slots, setSlots] = useState<FlexibleSlotInput[]>(() => {
    if (initialConfig?.customSlots && initialConfig.customSlots.length > 0) {
      return initialConfig.customSlots.map((cs, idx) => ({
        id: cs.id || `slot-${idx + 1}`,
        start_time: cs.start_time,
        end_time: cs.end_time,
        capacity: cs.capacity || 1,
      }));
    }
    // Default example slots from requirements: 9:00-9:15(5), 9:15-9:30(3), 9:30-9:40(2), 9:40-10:00(4)
    return [
      { id: 'slot-1', start_time: '09:00', end_time: '09:15', capacity: 5 },
      { id: 'slot-2', start_time: '09:15', end_time: '09:30', capacity: 3 },
      { id: 'slot-3', start_time: '09:30', end_time: '09:40', capacity: 2 },
      { id: 'slot-4', start_time: '09:40', end_time: '10:00', capacity: 4 },
    ];
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Sync state if initialConfig changes externally
  useEffect(() => {
    if (!initialConfig) return;
    if (initialConfig.workingHours?.length) {
      setWorkingPeriods(
        initialConfig.workingHours.map((wh, idx) => ({
          id: `wp-${idx + 1}`,
          start: wh.start,
          end: wh.end,
        }))
      );
    } else if (initialConfig.ranges?.length) {
      setWorkingPeriods(
        initialConfig.ranges.map((r, idx) => ({
          id: r.id || `wp-${idx + 1}`,
          start: r.start,
          end: r.end,
        }))
      );
    }
    if (initialConfig.availableDays?.length) {
      setAvailableDays(initialConfig.availableDays);
    }
    if (initialConfig.customSlots?.length) {
      setSlots(
        initialConfig.customSlots.map((cs, idx) => ({
          id: cs.id || `slot-${idx + 1}`,
          start_time: cs.start_time,
          end_time: cs.end_time,
          capacity: cs.capacity || 1,
        }))
      );
    }
  }, [initialConfig]);

  // Real-time Validation Check
  const validation = useMemo(() => {
    return validateFlexibleSlotsConfig(workingPeriods, slots);
  }, [workingPeriods, slots]);

  // Schedule Metrics
  const stats = useMemo(() => {
    const totalSlots = slots.length;
    const totalDailyCapacity = slots.reduce((sum, s) => sum + (Number(s.capacity) || 0), 0);
    const activeDaysCount = availableDays.length;
    return {
      totalSlots,
      totalDailyCapacity,
      activeDaysCount,
    };
  }, [slots, availableDays]);

  // Handle Working Hours Changes
  const updateWorkingPeriod = (id: string, field: 'start' | 'end', value: string) => {
    setWorkingPeriods((prev) =>
      prev.map((wp) => (wp.id === id ? { ...wp, [field]: value } : wp))
    );
  };

  const addWorkingPeriod = () => {
    const lastPeriod = workingPeriods[workingPeriods.length - 1];
    let nextStart = '14:00';
    let nextEnd = '18:00';
    if (lastPeriod) {
      const lastEndMin = parseTimeToMinutes(lastPeriod.end);
      if (lastEndMin + 60 < 1440) {
        nextStart = minutesToFormattedTime(lastEndMin + 60).replace(' AM', '').replace(' PM', '');
        nextEnd = minutesToFormattedTime(Math.min(1439, lastEndMin + 300)).replace(' AM', '').replace(' PM', '');
      }
    }
    setWorkingPeriods((prev) => [
      ...prev,
      { id: `wp-${Date.now()}`, start: nextStart, end: nextEnd },
    ]);
  };

  const removeWorkingPeriod = (id: string) => {
    if (workingPeriods.length <= 1) return;
    setWorkingPeriods((prev) => prev.filter((wp) => wp.id !== id));
  };

  // Handle Days of Week Toggle
  const toggleDay = (dayIndex: number) => {
    setAvailableDays((prev) => {
      if (prev.includes(dayIndex)) {
        if (prev.length === 1) {
          toastError('At least one available day of the week must be selected.');
          return prev;
        }
        return prev.filter((d) => d !== dayIndex);
      }
      return [...prev, dayIndex].sort();
    });
  };

  // Handle Slot Operations
  const handleUpdateSlot = (
    id: string,
    updates: Partial<FlexibleSlotInput>
  ) => {
    setSlots((prev) =>
      prev.map((slot) => {
        if (slot.id !== id) return slot;
        const next = { ...slot, ...updates };

        // If start_time was updated, adjust end_time to preserve duration if needed
        if (updates.start_time && !updates.end_time) {
          const prevDuration = getSlotDurationMinutes(slot.start_time, slot.end_time) || 15;
          next.end_time = calculateEndTimeFromDuration(updates.start_time, prevDuration);
        }

        return next;
      })
    );
  };

  const handleSetSlotDuration = (id: string, durationMinutes: number) => {
    setSlots((prev) =>
      prev.map((slot) => {
        if (slot.id !== id) return slot;
        return {
          ...slot,
          end_time: calculateEndTimeFromDuration(slot.start_time, durationMinutes),
        };
      })
    );
  };

  const handleAddSlot = () => {
    let nextStart = '09:00';
    let nextEnd = '09:15';

    if (slots.length > 0) {
      const lastSlot = slots[slots.length - 1];
      const lastEndMin = parseTimeToMinutes(lastSlot.end_time);
      const prevDuration = getSlotDurationMinutes(lastSlot.start_time, lastSlot.end_time) || 15;

      nextStart = minutesToFormattedTime(lastEndMin);
      nextEnd = calculateEndTimeFromDuration(nextStart, prevDuration);
    } else if (workingPeriods.length > 0 && workingPeriods[0].start) {
      nextStart = workingPeriods[0].start;
      nextEnd = calculateEndTimeFromDuration(nextStart, 15);
    }

    const newSlot: FlexibleSlotInput = {
      id: `slot-${Date.now()}`,
      start_time: nextStart,
      end_time: nextEnd,
      capacity: 1,
    };

    setSlots((prev) => [...prev, newSlot]);
  };

  const handleDuplicateSlot = (slot: FlexibleSlotInput) => {
    const sMin = parseTimeToMinutes(slot.end_time);
    const dur = getSlotDurationMinutes(slot.start_time, slot.end_time) || 15;
    const nextStart = minutesToFormattedTime(sMin);
    const nextEnd = calculateEndTimeFromDuration(nextStart, dur);

    const dup: FlexibleSlotInput = {
      id: `slot-${Date.now()}`,
      start_time: nextStart,
      end_time: nextEnd,
      capacity: slot.capacity,
    };

    setSlots((prev) => [...prev, dup]);
  };

  const handleDeleteSlot = (id: string) => {
    setSlots((prev) => prev.filter((s) => s.id !== id));
  };

  // Quick Auto-Generate Presets
  const handleAutoGenerate = (intervalMinutes: number, defaultCap = 2) => {
    if (workingPeriods.length === 0) return;
    const generated = generateDefaultFlexibleSlots(workingPeriods, intervalMinutes, defaultCap);
    if (generated.length === 0) {
      toastError('Could not generate slots. Please verify your working hours.');
      return;
    }
    setSlots(generated);
  };

  // Save Schedule
  const handleSaveSchedule = async () => {
    if (!validation.valid) {
      toastError(validation.error || 'Please fix the errors in your slot configuration.');
      return;
    }

    setIsSaving(true);
    setSaveSuccessMsg(null);

    try {
      const customSlotsPayload: CustomSlotDefinition[] = slots.map((s) => ({
        id: s.id,
        start_time: minutesToFormattedTime(parseTimeToMinutes(s.start_time)),
        end_time: minutesToFormattedTime(parseTimeToMinutes(s.end_time)),
        capacity: Math.max(1, Number(s.capacity) || 1),
      }));

      const workingHoursPayload = workingPeriods.map((wp) => ({
        start: minutesToFormattedTime(parseTimeToMinutes(wp.start)),
        end: minutesToFormattedTime(parseTimeToMinutes(wp.end)),
      }));

      const rangesPayload = workingPeriods.map((wp) => ({
        id: wp.id || `wp-${Date.now()}`,
        start: wp.start,
        end: wp.end,
        concurrent: Math.max(...slots.map((s) => s.capacity), 1),
      }));

      const configPayload: SlotConfig = {
        ranges: rangesPayload,
        workingHours: workingHoursPayload,
        customSlots: customSlotsPayload,
        slotDurationMinutes: getSlotDurationMinutes(slots[0].start_time, slots[0].end_time) || 15,
        availableDays,
        allowCancellation: initialConfig?.allowCancellation ?? true,
        bufferMinutes: initialConfig?.bufferMinutes ?? 0,
        advanceBookingDays: initialConfig?.advanceBookingDays ?? 14,
      };

      // 1. Update shop slot_config
      const slotRes = await updateSlotConfig(shopId, configPayload);
      if (!slotRes.success) {
        throw new Error(slotRes.error || 'Failed to save appointment slot configuration.');
      }

      // 2. Synchronize appointment slots for upcoming days (preserves existing bookings)
      const syncRes = await generateAndSyncAppointmentSlots(shopId, serviceId, configPayload);
      if (!syncRes.success) {
        console.warn('Warning syncing upcoming slots:', syncRes.error);
      }

      success('Appointment schedule and flexible slots saved successfully.');
      setSaveSuccessMsg('Schedule saved! Customer appointment slots have been updated.');

      if (onSave) {
        onSave(configPayload);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error saving schedule.';
      toastError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="vaango-sched-config" aria-label="Flexible Appointment Slot Configuration">
      {/* Header & Metrics */}
      <div className="vaango-sched-header">
        <div className="vaango-sched-title-group">
          <h2 className="vaango-sched-title">
            <Clock size={20} className="text-primary" />
            Flexible Appointment Slot Schedule
          </h2>
          <p className="vaango-sched-desc">
            Customize appointment slot durations and booking capacity within your working hours.
          </p>
        </div>

        <div className="vaango-sched-stats">
          <div className="vaango-sched-stat-badge" title="Configured appointment intervals">
            <Layers size={14} className="text-primary" />
            <span>Slots: <strong>{stats.totalSlots}</strong></span>
          </div>
          <div className="vaango-sched-stat-badge" title="Maximum bookings accepted across all slots per day">
            <Users size={14} className="text-primary" />
            <span>Daily Capacity: <strong>{stats.totalDailyCapacity} bookings</strong></span>
          </div>
          <div className="vaango-sched-stat-badge" title="Available days of operation per week">
            <Calendar size={14} className="text-primary" />
            <span>Open: <strong>{stats.activeDaysCount} days/wk</strong></span>
          </div>
        </div>
      </div>

      {/* 1. Working Hours & Available Days Section */}
      <div className="vaango-sched-section">
        <div>
          <h3 className="vaango-sched-section__title">
            <Clock size={18} className="text-primary" />
            1. Working Hours & Open Days
          </h3>
          <p className="vaango-sched-section__subtitle">
            Define your overall daily operating window and the days customers can book appointments.
          </p>
        </div>

        {/* Days of week selector */}
        <div>
          <label className="vaango-form-label mb-2">Available Booking Days</label>
          <div className="vaango-sched-days-grid" role="group" aria-label="Available Days">
            {DAY_OPTIONS.map((day) => {
              const isChecked = availableDays.includes(day.dayIndex);
              return (
                <button
                  key={day.dayIndex}
                  type="button"
                  disabled={readOnly}
                  className={`vaango-sched-day-pill ${isChecked ? 'vaango-sched-day-pill--active' : ''}`}
                  onClick={() => toggleDay(day.dayIndex)}
                  aria-pressed={isChecked}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {}}
                    tabIndex={-1}
                    aria-hidden="true"
                  />
                  <span>{day.full}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Working Hours Shifts */}
        <div>
          <label className="vaango-form-label mb-2">Daily Working Hours (Shifts)</label>
          <div className="vaango-sched-hours-list">
            {workingPeriods.map((wp, idx) => (
              <div key={wp.id} className="vaango-sched-hours-row">
                <span className="vaango-sched-hours-label">
                  {workingPeriods.length > 1 ? `Shift ${idx + 1}:` : 'Working Hours:'}
                </span>

                <div className="vaango-sched-time-group">
                  <TimePicker12h
                    id={`wp-start-${wp.id || idx}`}
                    value={wp.start || '09:00'}
                    onChange={(val) => updateWorkingPeriod(wp.id || '', 'start', val)}
                  />
                  <span className="vaango-sched-to-text">to</span>
                  <TimePicker12h
                    id={`wp-end-${wp.id || idx}`}
                    value={wp.end || '17:00'}
                    onChange={(val) => updateWorkingPeriod(wp.id || '', 'end', val)}
                  />
                </div>

                {!readOnly && workingPeriods.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeWorkingPeriod(wp.id || '')}
                    leftIcon={<Trash2 size={14} />}
                  >
                    Remove Shift
                  </Button>
                )}
              </div>
            ))}
          </div>

          {!readOnly && (
            <div className="mt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addWorkingPeriod}
                leftIcon={<Plus size={14} />}
              >
                + Add Another Shift
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* 2. Custom Slots Configuration Section */}
      <div className="vaango-sched-section">
        <div className="flex justify-between items-start flex-wrap gap-2">
          <div>
            <h3 className="vaango-sched-section__title">
              <Sparkles size={18} className="text-primary" />
              2. Custom Appointment Slots & Booking Capacity
            </h3>
            <p className="vaango-sched-section__subtitle">
              Configure each slot's start time, duration, and maximum number of bookings (capacity).
            </p>
          </div>

          {!readOnly && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleAddSlot}
                leftIcon={<Plus size={16} />}
              >
                Add Slot
              </Button>
            </div>
          )}
        </div>

        {/* Quick Fill / Auto-populate helper toolbar */}
        {!readOnly && (
          <div className="vaango-sched-slots-toolbar">
            <span className="vaango-sched-quickfill-label">Quick Presets:</span>
            <div className="vaango-sched-quickfill-group">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleAutoGenerate(15, 3)}
              >
                Fill 15-min Slots (3 cap)
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleAutoGenerate(20, 2)}
              >
                Fill 20-min Slots (2 cap)
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleAutoGenerate(30, 4)}
              >
                Fill 30-min Slots (4 cap)
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSlots([
                    { id: 'slot-1', start_time: '09:00', end_time: '09:15', capacity: 5 },
                    { id: 'slot-2', start_time: '09:15', end_time: '09:30', capacity: 3 },
                    { id: 'slot-3', start_time: '09:30', end_time: '09:40', capacity: 2 },
                    { id: 'slot-4', start_time: '09:40', end_time: '10:00', capacity: 4 },
                  ]);
                }}
              >
                Example: 9-10 AM Mixed
              </Button>
              {slots.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSlots([])}
                  leftIcon={<RotateCcw size={14} />}
                >
                  Clear All
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Validation Error Banner */}
        {!validation.valid && validation.error && (
          <div className="vaango-sched-alert vaango-sched-alert--error" role="alert">
            <AlertCircle size={18} className="flex-shrink-0" />
            <div>
              <strong>Schedule Error:</strong> {validation.error}
            </div>
          </div>
        )}

        {saveSuccessMsg && (
          <div className="vaango-sched-alert vaango-sched-alert--success" role="status">
            <CheckCircle2 size={18} className="flex-shrink-0" />
            <div>{saveSuccessMsg}</div>
          </div>
        )}

        {/* Slots Table (Desktop View) */}
        {slots.length === 0 ? (
          <div className="vaango-sched-empty">
            <Clock size={36} className="text-secondary" />
            <h4 className="vaango-sched-empty-title">No appointment slots configured</h4>
            <p className="vaango-sched-empty-desc">
              Add custom slots individually or use one of the Quick Presets above to generate slots across your working hours.
            </p>
            {!readOnly && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => handleAutoGenerate(15, 2)}
                leftIcon={<Plus size={16} />}
              >
                Generate Initial 15-min Slots
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="vaango-sched-slots-table-wrap">
              <table className="vaango-sched-slots-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>#</th>
                    <th style={{ minWidth: '170px' }}>Start Time</th>
                    <th style={{ minWidth: '170px' }}>End Time</th>
                    <th style={{ width: '130px' }}>Duration</th>
                    <th style={{ width: '160px' }}>Max Capacity</th>
                    {!readOnly && <th style={{ width: '110px' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {slots.map((slot, index) => {
                    const duration = getSlotDurationMinutes(slot.start_time, slot.end_time);
                    const slotErr = validation.slotErrors?.[slot.id];
                    const isInvalid = Boolean(slotErr);

                    return (
                      <tr
                        key={slot.id}
                        className={`vaango-sched-slot-row ${isInvalid ? 'vaango-sched-slot-row--error' : ''}`}
                      >
                        <td style={{ fontWeight: 600, color: 'var(--color-text-muted)' }}>
                          {index + 1}
                        </td>
                        <td>
                          <TimePicker12h
                            id={`slot-start-${slot.id}`}
                            value={slot.start_time}
                            onChange={(val) => handleUpdateSlot(slot.id, { start_time: val })}
                          />
                        </td>
                        <td>
                          <TimePicker12h
                            id={`slot-end-${slot.id}`}
                            value={slot.end_time}
                            onChange={(val) => handleUpdateSlot(slot.id, { end_time: val })}
                          />
                          {slotErr && (
                            <div className="vaango-sched-slot-error-msg">
                              <AlertCircle size={12} />
                              <span>{slotErr}</span>
                            </div>
                          )}
                        </td>
                        <td>
                          <div className="flex flex-col gap-1">
                            <span className="vaango-sched-duration-pill">
                              {duration} min{duration === 1 ? '' : 's'}
                            </span>
                            {!readOnly && (
                              <div className="flex gap-1">
                                {[10, 15, 30].map((d) => (
                                  <button
                                    key={d}
                                    type="button"
                                    className="text-xs text-primary underline"
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                    onClick={() => handleSetSlotDuration(slot.id, d)}
                                  >
                                    {d}m
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="vaango-sched-capacity-input-wrap">
                            <input
                              type="number"
                              min={1}
                              max={500}
                              disabled={readOnly}
                              className="vaango-sched-capacity-input"
                              value={slot.capacity}
                              onChange={(e) =>
                                handleUpdateSlot(slot.id, {
                                  capacity: Math.max(1, parseInt(e.target.value, 10) || 1),
                                })
                              }
                            />
                            <span className="text-xs text-secondary">bookings</span>
                          </div>
                        </td>
                        {!readOnly && (
                          <td>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                title="Duplicate slot"
                                onClick={() => handleDuplicateSlot(slot)}
                                className="p-1 hover:text-primary transition-colors"
                                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                              >
                                <Copy size={16} />
                              </button>
                              <button
                                type="button"
                                title="Delete slot"
                                onClick={() => handleDeleteSlot(slot.id)}
                                className="p-1 hover:text-danger transition-colors text-danger"
                                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List View (< 768px) */}
            <div className="vaango-sched-mobile-slots-list">
              {slots.map((slot, index) => {
                const duration = getSlotDurationMinutes(slot.start_time, slot.end_time);
                const slotErr = validation.slotErrors?.[slot.id];
                const isInvalid = Boolean(slotErr);

                return (
                  <div
                    key={slot.id}
                    className={`vaango-sched-mobile-slot-card ${isInvalid ? 'vaango-sched-mobile-slot-card--error' : ''}`}
                  >
                    <div className="vaango-sched-mobile-card-top">
                      <span className="vaango-sched-mobile-card-num">Slot #{index + 1}</span>
                      <div className="flex items-center gap-2">
                        <span className="vaango-sched-duration-pill">{duration} mins</span>
                        {!readOnly && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleDuplicateSlot(slot)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                              title="Duplicate"
                            >
                              <Copy size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSlot(slot.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)' }}
                              title="Delete"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-secondary font-medium mb-1 block">Start Time</label>
                        <TimePicker12h
                          id={`mob-start-${slot.id}`}
                          value={slot.start_time}
                          onChange={(val) => handleUpdateSlot(slot.id, { start_time: val })}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-secondary font-medium mb-1 block">End Time</label>
                        <TimePicker12h
                          id={`mob-end-${slot.id}`}
                          value={slot.end_time}
                          onChange={(val) => handleUpdateSlot(slot.id, { end_time: val })}
                        />
                      </div>
                    </div>

                    {slotErr && (
                      <div className="vaango-sched-slot-error-msg">
                        <AlertCircle size={14} />
                        <span>{slotErr}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
                      <label className="text-xs font-semibold text-secondary">
                        Maximum Bookings (Capacity):
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        disabled={readOnly}
                        className="vaango-sched-capacity-input"
                        value={slot.capacity}
                        onChange={(e) =>
                          handleUpdateSlot(slot.id, {
                            capacity: Math.max(1, parseInt(e.target.value, 10) || 1),
                          })
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Save Button Action */}
      {!readOnly && (
        <div className="vaango-sched-actions">
          <Button
            type="button"
            variant="primary"
            size="lg"
            isLoading={isSaving}
            disabled={!validation.valid || slots.length === 0}
            onClick={handleSaveSchedule}
            leftIcon={<CheckCircle2 size={18} />}
          >
            Save Appointment Schedule
          </Button>
        </div>
      )}
    </div>
  );
};
