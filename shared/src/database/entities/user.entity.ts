import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany } from 'typeorm';
import {Tenant} from './tenant.entity';
import {Job} from './job.entity'

@Entity('users')
    export class User {
        @PrimaryGeneratedColumn('uuid')
        id: string;

        @Column({length: 255})
        name: string

        @Column({length: 255, unique: true})
        email: string;

        @Column({default: true})
        isActive: boolean

        @CreateDateColumn()
        createdAt: Date;

        @UpdateDateColumn()
        updatedAt: Date;

        @ManyToOne(()=> Tenant, tenant => tenant.users)
        tenant: Tenant

        @OneToMany(()=> Job, job => job.user)
        jobs: Job[]
    }