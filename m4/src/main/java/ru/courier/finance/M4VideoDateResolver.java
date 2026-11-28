package ru.courier.finance;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Resolves a time-only slot range against the MP4 creation timestamp.
 * Ambiguous dates are left unresolved so the fact writer can keep the import
 * pending instead of silently assigning orders to the wrong forecast day.
 */
final class M4VideoDateResolver {
    private static final ZoneId ZONE=ZoneId.of("Europe/Moscow");
    private static final Pattern TIME=Pattern.compile("(?:[01]?\\d|2[0-3]):[0-5]\\d");

    static final class Resolution {
        final LocalDate date;
        final int startMinute;
        final int endMinute;
        final LocalDateTime recordingLocal;
        final boolean previousDay;

        Resolution(LocalDate date,int startMinute,int endMinute,LocalDateTime recordingLocal,boolean previousDay) {
            this.date=date; this.startMinute=startMinute; this.endMinute=endMinute;
            this.recordingLocal=recordingLocal; this.previousDay=previousDay;
        }
    }

    private M4VideoDateResolver() {}

    static Resolution resolve(String creationTimeMetadata,String startText,String endText,List<String> orderTimes) {
        LocalDateTime recordingLocal=parseRecordingTime(creationTimeMetadata);
        Integer start=parseMinute(startText),end=parseMinute(endText);
        if(recordingLocal==null||start==null||end==null||end<=start||orderTimes==null||orderTimes.isEmpty()) return null;

        int recordingMinute=recordingLocal.getHour()*60+recordingLocal.getMinute();
        boolean orderAfterRecording=false;
        for(String value:orderTimes) {
            Integer minute=parseMinute(value);
            if(minute!=null&&minute>recordingMinute&&minute>=start&&minute<=end) {
                orderAfterRecording=true;
                break;
            }
        }

        if(end>recordingMinute) {
            // A completed row later than the recording clock cannot belong to
            // the same local calendar day. This is the evidence for a prior day.
            if(!orderAfterRecording) return null;
            return new Resolution(recordingLocal.toLocalDate().minusDays(1),start,end,recordingLocal,true);
        }

        // The clip must have been recorded shortly after the slot ended.
        // Longer gaps make "today" versus "yesterday" indistinguishable.
        if(recordingMinute-end>12*60) return null;
        return new Resolution(recordingLocal.toLocalDate(),start,end,recordingLocal,false);
    }

    static LocalDateTime parseRecordingTime(String value) {
        if(value==null||value.trim().isEmpty()) return null;
        try {
            return OffsetDateTime.parse(value.trim()).atZoneSameInstant(ZONE).toLocalDateTime();
        } catch(Exception invalid) {
            return null;
        }
    }

    private static Integer parseMinute(String value) {
        if(value==null) return null;
        String text=value.trim();
        if(!TIME.matcher(text).matches()) return null;
        try {
            int hour=Integer.parseInt(text.substring(0,2));
            int minute=Integer.parseInt(text.substring(3,5));
            return hour*60+minute;
        } catch(Exception ignored) {
            // Accept a one-digit hour as well as the parser's normalized HH:mm.
            Matcher matcher=Pattern.compile("(\\d{1,2}):(\\d{2})").matcher(text);
            if(!matcher.matches()) return null;
            try { return Integer.parseInt(matcher.group(1))*60+Integer.parseInt(matcher.group(2)); }
            catch(Exception invalid) { return null; }
        }
    }
}
