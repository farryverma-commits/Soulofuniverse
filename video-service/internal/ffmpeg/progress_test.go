package ffmpeg

import (
	"bufio"
	"strings"
	"testing"
)

func feed(t *testing.T, input string, dur float64) []int {
	t.Helper()
	var got []int
	ParseProgress(bufio.NewScanner(strings.NewReader(input)), dur, func(p int) {
		got = append(got, p)
	})
	return got
}

func TestParseProgressPercent(t *testing.T) {
	got := feed(t, "out_time_ms=5000000\nout_time=00:00:05.000000\n", 10)
	if len(got) != 1 || got[0] != 50 {
		t.Fatalf("got %v, want [50]", got)
	}
}

func TestParseProgressEndForces100(t *testing.T) {
	got := feed(t, "out_time_ms=1000000\nprogress=end\n", 100)
	if len(got) != 2 || got[1] != 100 {
		t.Fatalf("got %v, want [.., 100]", got)
	}
}

func TestParseProgressClampsAndIgnores(t *testing.T) {
	got := feed(t, "frame=12\nout_time_ms=999999999\nbogus\nout_time_ms=-5\n", 10)
	if len(got) != 1 || got[0] != 100 {
		t.Fatalf("got %v, want [100]", got)
	}
}

func TestParseProgressZeroDuration(t *testing.T) {
	got := feed(t, "out_time_ms=5000000\nprogress=end\n", 0)
	if len(got) != 1 || got[0] != 100 {
		t.Fatalf("got %v, want [100]", got)
	}
}

func TestParseProgressNilCallback(t *testing.T) {
	ParseProgress(bufio.NewScanner(strings.NewReader("out_time_ms=1\n")), 10, nil)
}
