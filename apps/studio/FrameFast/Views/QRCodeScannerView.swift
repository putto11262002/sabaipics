//  QRCodeScannerView.swift
//  FrameFast
//
//  Minimal QR code scanner for Sony WiFi setup.
//

import SwiftUI
import AVFoundation

struct QRCodeScannerView: UIViewControllerRepresentable {
    typealias UIViewControllerType = QRCodeScannerViewController

    let onScan: (String) -> Void
    let onCancel: () -> Void

    func makeUIViewController(context: Context) -> QRCodeScannerViewController {
        let vc = QRCodeScannerViewController()
        vc.onScan = onScan
        vc.onCancel = onCancel
        return vc
    }

    func updateUIViewController(_ uiViewController: QRCodeScannerViewController, context: Context) {}
}

final class QRCodeScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var onScan: ((String) -> Void)?
    var onCancel: (() -> Void)?

    private let session = AVCaptureSession()
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var didEmit = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        configureSession()
        configureOverlay()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        didEmit = false
        if !session.isRunning {
            session.startRunning()
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        if session.isRunning {
            session.stopRunning()
        }
    }

    private func configureSession() {
        session.beginConfiguration()
        session.sessionPreset = .high

        guard let device = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: device),
              session.canAddInput(input) else {
            session.commitConfiguration()
            return
        }
        session.addInput(input)

        let output = AVCaptureMetadataOutput()
        guard session.canAddOutput(output) else {
            session.commitConfiguration()
            return
        }
        session.addOutput(output)

        output.setMetadataObjectsDelegate(self, queue: DispatchQueue.main)
        output.metadataObjectTypes = [.qr]

        session.commitConfiguration()

        let preview = AVCaptureVideoPreviewLayer(session: session)
        preview.videoGravity = .resizeAspectFill
        view.layer.insertSublayer(preview, at: 0)
        previewLayer = preview
    }

    private func configureOverlay() {
        let close = UIButton(type: .system)
        close.setTitle("Close", for: .normal)
        close.setTitleColor(.white, for: .normal)
        close.backgroundColor = UIColor(white: 0.0, alpha: 0.5)
        close.layer.cornerRadius = 10
        close.contentEdgeInsets = UIEdgeInsets(top: 10, left: 14, bottom: 10, right: 14)
        close.addTarget(self, action: #selector(tapClose), for: .touchUpInside)
        close.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(close)

        NSLayoutConstraint.activate([
            close.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 14),
            close.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 14),
        ])
    }

    @objc private func tapClose() {
        onCancel?()
    }

    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard !didEmit else { return }
        guard let obj = metadataObjects.compactMap({ $0 as? AVMetadataMachineReadableCodeObject }).first,
              obj.type == .qr,
              let value = obj.stringValue,
              !value.isEmpty else {
            return
        }

        didEmit = true
        onScan?(value)
    }
}
