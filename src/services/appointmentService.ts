import Appointment, { AppointmentDocument } from "../models/Appointment";
import Doctor from "../models/Doctor";
import { Types } from "mongoose";
import moment from "moment";

// Define interfaces for return types
interface TimeSlot {
  startTime: string;
  endTime: string;
  dateTime: string;
  available: boolean;
}

interface DayAvailability {
  date: string;
  available: boolean;
  slots: TimeSlot[];
}

interface WorkingDay {
  day: string;
  isWorking: boolean;
  startTime: string;
  endTime: string;
}

interface BreakTime {
  startTime: string;
  endTime: string;
}

interface DoctorSchedule {
  workingDays: WorkingDay[];
  breakTimes?: BreakTime[];
  slotDuration: number;
}

class AppointmentService {
  // Check if a time slot is available
  static async checkSlotAvailability(
    doctorId: string | Types.ObjectId,
    appointmentDateTime: Date | string,
    duration: number = 30
  ): Promise<boolean> {
    const startTime: Date = new Date(appointmentDateTime);
    const endTime: Date = new Date(startTime.getTime() + duration * 60000);

    // Check for existing appointments
    const existingAppointment: AppointmentDocument | null =
      await Appointment.findOne({
        doctor: doctorId,
        status: { $in: ["scheduled", "confirmed", "in-progress"] },
        $or: [
          {
            appointmentDateTime: { $lt: endTime },
            $expr: {
              $gt: [
                {
                  $add: [
                    "$appointmentDateTime",
                    { $multiply: ["$duration", 60000] },
                  ],
                },
                startTime,
              ],
            },
          },
        ],
      });

    return !existingAppointment;
  }

  // Get doctor's availability for a date range
  static async getDoctorAvailability(
    doctorId: string | Types.ObjectId,
    startDate: Date | string,
    endDate: Date | string
  ): Promise<DayAvailability[]> {
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      throw new Error("Doctor not found");
    }

    const availability: DayAvailability[] = [];
    const current = moment(startDate);
    const end = moment(endDate);

    while (current.isSameOrBefore(end)) {
      const dayName: string = current.format("dddd").toLowerCase();
      const workingDay: WorkingDay | undefined =
        doctor.schedule.workingDays.find(
          (day: WorkingDay) => day.day === dayName
        );

      if (workingDay && workingDay.isWorking) {
        const dayAvailability: TimeSlot[] = await this.getDayAvailability(
          doctorId,
          current.toDate(),
          workingDay,
          doctor.schedule.slotDuration
        );

        availability.push({
          date: current.format("YYYY-MM-DD"),
          available: dayAvailability.length > 0,
          slots: dayAvailability,
        });
      } else {
        availability.push({
          date: current.format("YYYY-MM-DD"),
          available: false,
          slots: [],
        });
      }

      current.add(1, "day");
    }

    return availability;
  }

  // Get available slots for a specific date
  static async getAvailableSlots(
    doctorId: string | Types.ObjectId,
    date: Date | string
  ): Promise<TimeSlot[]> {
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      throw new Error("Doctor not found");
    }

    const dayName: string = moment(date).format("dddd").toLowerCase();
    const workingDay: WorkingDay | undefined = doctor.schedule.workingDays.find(
      (day: WorkingDay) => day.day === dayName
    );

    if (!workingDay || !workingDay.isWorking) {
      return [];
    }

    return this.getDayAvailability(
      doctorId,
      date,
      workingDay,
      doctor.schedule.slotDuration
    );
  }

  // Get available time slots for a specific day
  static async getDayAvailability(
    doctorId: string | Types.ObjectId,
    date: Date | string,
    workingDay: WorkingDay,
    slotDuration: number
  ): Promise<TimeSlot[]> {
    const dateStr: string = moment(date).format("YYYY-MM-DD");
    const startTime = moment(`${dateStr} ${workingDay.startTime}`);
    const endTime = moment(`${dateStr} ${workingDay.endTime}`);

    // Get existing appointments for the day
    const existingAppointments: Pick<
      AppointmentDocument,
      "appointmentDateTime" | "duration"
    >[] = await Appointment.find({
      doctor: doctorId,
      status: { $in: ["scheduled", "confirmed", "in-progress"] },
      appointmentDateTime: {
        $gte: startTime.toDate(),
        $lt: endTime.toDate(),
      },
    }).select("appointmentDateTime duration");

    const slots: TimeSlot[] = [];
    const current = startTime.clone();

    // Get doctor data for break times
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      throw new Error("Doctor not found");
    }

    while (current.isBefore(endTime)) {
      const slotStart = current.clone();
      const slotEnd = current.clone().add(slotDuration, "minutes");

      // Check if slot conflicts with existing appointments
      const hasConflict: boolean = existingAppointments.some((apt) => {
        const aptStart = moment(apt.appointmentDateTime);
        const aptEnd = aptStart.clone().add(apt.duration, "minutes");

        return slotStart.isBefore(aptEnd) && slotEnd.isAfter(aptStart);
      });

      // Check if slot conflicts with break times
      const hasBreakConflict: boolean =
        doctor.schedule.breakTimes?.some((breakTime: BreakTime) => {
          const breakStart = moment(`${dateStr} ${breakTime.startTime}`);
          const breakEnd = moment(`${dateStr} ${breakTime.endTime}`);

          return slotStart.isBefore(breakEnd) && slotEnd.isAfter(breakStart);
        }) ?? false;

      if (
        !hasConflict &&
        !hasBreakConflict &&
        slotEnd.isSameOrBefore(endTime)
      ) {
        slots.push({
          startTime: slotStart.format("HH:mm"),
          endTime: slotEnd.format("HH:mm"),
          dateTime: slotStart.toISOString(),
          available: true,
        });
      }

      current.add(slotDuration, "minutes");
    }

    return slots;
  }

  // Check for upcoming appointments (for reminders)
  static async checkUpcomingAppointments(): Promise<AppointmentDocument[]> {
    const tomorrow = moment().add(1, "day").startOf("day");
    const dayAfterTomorrow = moment().add(2, "day").startOf("day");

    const upcomingAppointments: AppointmentDocument[] = await Appointment.find({
      appointmentDateTime: {
        $gte: tomorrow.toDate(),
        $lt: dayAfterTomorrow.toDate(),
      },
      status: { $in: ["scheduled", "confirmed"] },
      remindersSent: { $lt: 2 },
    }).populate(["patient", "doctor"]);

    return upcomingAppointments;
  }
}

export default AppointmentService;
