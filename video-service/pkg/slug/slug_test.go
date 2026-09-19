package slug

import "testing"

func TestGenerate(t *testing.T) {
	cases := []struct{ in, want string }{
		{"My_Video 2024!.mp4", "my-video-2024"},
		{"Lecture 01 - Intro (final).mkv", "lecture-01-intro-final"},
		{"a.b.mp4", "ab"},
		{"  spaced__out  .avi", "spaced-out"},
		{"Café Münchén.mov", "café-münchén"},
		{"already-clean-slug.mp4", "already-clean-slug"},
		{"UPPER_CASE NAME.MP4", "upper-case-name"},
	}
	for _, c := range cases {
		if got := Generate(c.in); got != c.want {
			t.Errorf("Generate(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestDisplayTitle(t *testing.T) {
	cases := []struct{ in, want string }{
		{"my_show.s01e02.mp4", "my show"},
		{"Lecture 01 - Intro.mkv", "Lecture 01 - Intro"},
		{"noext", "noext"},
	}
	for _, c := range cases {
		if got := DisplayTitle(c.in); got != c.want {
			t.Errorf("DisplayTitle(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
