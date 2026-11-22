import SwiftUI
import PinPlanCore

/// The running tour over the whole window: the screen dimmed with a spotlight on the step's control, and the step's
/// card beside it (PinPlanCore's TutorialLayout places it). Taps go through the dimmed layer, so people can do the
/// step for real; only the card takes taps. No control on screen: the card shows in the middle after a moment.
/// Also shows "Tour finished…" for a moment after a tour ends.
struct TutorialOverlay: View {
    @Environment(AppModel.self) private var app
    @Environment(\.horizontalSizeClass) private var hSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var cardHeight: CGFloat = 0
    /// The step's control had a moment to appear; without it the card now shows centred.
    @State private var graceOver = false

    private var tour: TutorialController { .shared }
    private var size: TutorialSizeClass { hSize == .compact ? .compact : .regular }

    var body: some View {
        ZStack {
            // While the demo job is being drawn the jobs screen says so; the card waits.
            if let step = tour.step, !app.creatingDemo {
                let target = TutorialAnchors.shared.frame(for: step.anchors(for: size))
                if target != nil || graceOver {
                    dimLayer(target)
                    cardLayer(step, target: target)
                }
            }
            if let notice = tour.notice { noticeView(notice) }
        }
        .animation(reduceMotion ? nil : .easeOut(duration: 0.25), value: tour.stepToken)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: tour.notice)
        .task(id: tour.stepToken) {
            graceOver = false
            try? await Task.sleep(for: .milliseconds(900))
            graceOver = true
        }
    }

    /// The screen dimmed, with a hole and a ring around the control. Never takes a tap.
    private func dimLayer(_ target: CGRect?) -> some View {
        GeometryReader { g in
            let origin = g.frame(in: .global).origin
            let full = CGRect(origin: .zero, size: g.size)
            let hole = spotlight(target, origin: origin, in: full)
            ZStack(alignment: .topLeading) {
                Path { p in
                    p.addRect(full)
                    if let hole { p.addRoundedRect(in: hole, cornerSize: CGSize(width: 12, height: 12), style: .continuous) }
                }
                .fill(Color.black.opacity(0.45), style: FillStyle(eoFill: true))
                if let hole {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(Color.electric, lineWidth: 3)
                        .frame(width: hole.width, height: hole.height)
                        .offset(x: hole.minX, y: hole.minY)
                }
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .transition(.opacity)
    }

    private func spotlight(_ target: CGRect?, origin: CGPoint, in full: CGRect) -> CGRect? {
        guard let t = target else { return nil }
        let local = TutorialRect(x: t.minX - origin.x, y: t.minY - origin.y, width: t.width, height: t.height)
        let box = TutorialRect(x: full.minX, y: full.minY, width: full.width, height: full.height)
        return TutorialLayout.spotlight(local, container: box).map { CGRect(x: $0.x, y: $0.y, width: $0.width, height: $0.height) }
    }

    /// The card, placed inside the safe area next to the spotlight.
    private func cardLayer(_ step: TutorialStep, target: CGRect?) -> some View {
        GeometryReader { g in
            let origin = g.frame(in: .global).origin
            let container = TutorialRect(x: 0, y: 0, width: g.size.width, height: g.size.height)
            let local = target.map { TutorialRect(x: $0.minX - origin.x, y: $0.minY - origin.y, width: $0.width, height: $0.height) }
            let spot = TutorialLayout.spotlight(local, container: container)
            let width = TutorialLayout.cardWidth(container: container, size: size)
            let placed = TutorialLayout.place(card: (width: width, height: cardHeight > 0 ? Double(cardHeight) : 220), spotlight: spot,
                                              container: container, size: size)
            // Measured as laid out (not the frame around it), so the placement knows the card's real height.
            TutorialCard(step: step, index: tour.stepIndex, count: tour.steps.count, last: tour.isLastStep, centred: spot == nil)
                .frame(width: placed.frame.width)
                .measureHeight { cardHeight = $0 }
                .frame(maxHeight: max(160, g.size.height - 24), alignment: .top)
                .offset(x: placed.frame.x, y: placed.frame.y)
        }
        .transition(.opacity)
    }

    private func noticeView(_ text: String) -> some View {
        VStack {
            Spacer()
            Text(text)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 14).padding(.vertical, 9)
                .background(Color.ink.opacity(0.92), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .padding(.horizontal, 16)
                .padding(.bottom, 70)
        }
        .allowsHitTesting(false)
        .transition(.opacity)
        .onAppear { UIAccessibility.post(notification: .announcement, argument: text) }
    }
}

/// One step: "Step 2 of 9", the title and the words, then Skip · progress dots · Back · Next. × closes (Tutorials
/// then offers Resume); the first step also offers Don't show again. Non-modal for VoiceOver: the title takes focus
/// and the step is announced, and the rest of the screen stays reachable.
private struct TutorialCard: View {
    let step: TutorialStep
    let index: Int
    let count: Int
    let last: Bool
    let centred: Bool
    @AccessibilityFocusState private var titleFocused: Bool
    @ScaledMetric(relativeTo: .title2) private var symbolSize: CGFloat = 28

    private var tour: TutorialController { .shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text("Step \(index + 1) of \(count)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.secondary)
                    .accessibilityIdentifier("tutorial-progress")
                Spacer(minLength: 4)
                Button { tour.close() } label: {
                    Image(systemName: "xmark").font(.footnote.weight(.semibold)).frame(width: 44, height: 44).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color.secondary)
                .accessibilityLabel(Text("Close the tour (resume it from Help)"))
                .accessibilityIdentifier("tutorial-close")
            }
            .padding(.bottom, -6)
            // Long text at the largest sizes scrolls inside the card instead of pushing the buttons off screen.
            ViewThatFits(in: .vertical) {
                texts
                ScrollView { texts }
            }
            if index == 0 {
                Button("Don't show again") { tour.dontShowAgain() }
                    .font(.footnote)
                    .frame(minHeight: 44)
                    .accessibilityIdentifier("tutorial-dont-show")
            }
            controls
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 12)
        .padding(.top, 4)
        .background(Color(.tertiarySystemBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Color(.separator), lineWidth: 0.5))
        .shadow(color: Color.black.opacity(0.25), radius: 18, y: 8)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("tutorial-card")
        .onAppear(perform: announce)
        .onChange(of: step.id) { _, _ in announce() }
    }

    private var texts: some View {
        VStack(alignment: .leading, spacing: 6) {
            if centred {
                Image(systemName: step.symbol)
                    .font(.system(size: symbolSize))
                    .foregroundStyle(Color.brand)
                    .accessibilityHidden(true)
            }
            Text(tr(step.title))
                .font(.headline)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
                .accessibilityFocused($titleFocused)
            Text(tr(step.body))
                .font(.subheadline)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Buttons in one row when they fit; stacked at large text sizes and in long languages.
    private var controls: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) {
                skipButton
                Spacer(minLength: 4)
                dots
                Spacer(minLength: 4)
                backButton
                nextButton
            }
            VStack(alignment: .leading, spacing: 8) {
                dots
                HStack(spacing: 8) {
                    backButton
                    Spacer(minLength: 4)
                    nextButton
                }
                skipButton
            }
        }
    }

    @ViewBuilder private var skipButton: some View {
        if !last {
            Button("Skip") { tour.skip() }
                .buttonStyle(.borderless)
                .frame(minHeight: 44)
                .accessibilityLabel(Text("Skip tour"))
                .accessibilityIdentifier("tutorial-skip")
        }
    }

    private var backButton: some View {
        Button("Back") { tour.back() }
            .buttonStyle(.bordered)
            .disabled(index == 0)
            .frame(minHeight: 44)
            .accessibilityIdentifier("tutorial-back")
    }

    private var nextButton: some View {
        Button(last ? String(localized: "Done") : String(localized: "Next")) { tour.next() }
            .buttonStyle(.borderedProminent)
            .frame(minHeight: 44)
            .accessibilityIdentifier("tutorial-next")
    }

    private var dots: some View {
        HStack(spacing: 5) {
            ForEach(0..<count, id: \.self) { i in
                Circle()
                    .fill(i == index ? Color.brand : Color.secondary.opacity(0.35))
                    .frame(width: i == index ? 8 : 6, height: i == index ? 8 : 6)
            }
        }
        // "Step 2 of 9" says the same in words.
        .accessibilityHidden(true)
    }

    private func announce() {
        UIAccessibility.post(notification: .announcement, argument: String(localized: "Step \(index + 1) of \(count): \(tr(step.title))"))
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(400))
            titleFocused = true
        }
    }
}
