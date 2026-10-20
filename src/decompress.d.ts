/*! VS Code Extension (c) 2023 Shinji Kashihara (cypher256) @ WILL */
declare module '@xhmikosr/decompress' {
    interface File {
        data: Buffer;
        mode: number;
        mtime: Date;
        path: string;
        type: string; // 'file' | 'directory' | 'link' | 'symlink' | tar device types, etc.
        linkname?: string;
    }
    type Plugin = (input: Buffer, options: Options) => Promise<File[]>;
    interface Options {
        filter?(file: File): boolean;
        map?(file: File): File;
        plugins?: Plugin[];
        strip?: number;
    }
    function decompress(input: string | Buffer, options?: Options): Promise<File[]>;
    function decompress(input: string | Buffer, output?: string, options?: Options): Promise<File[]>;
    export default decompress;
}
